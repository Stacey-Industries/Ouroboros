#Requires -Version 5.1
<#
.SYNOPSIS
    PostToolUse hook - requires test file creation for new source files.
.DESCRIPTION
    After Write tool creates a new source file, checks whether a co-located
    test file exists. If not, exits 2 (BLOCK) with instructions so the agent
    creates tests before moving on.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# -- Read stdin ----------------------------------------------------------------
$stdin = $null
try { $stdin = [Console]::In.ReadToEnd() } catch {
    [Console]::Error.WriteLine("post_write_test_required: failed to read stdin: $_")
    exit 0
}
if ([string]::IsNullOrWhiteSpace($stdin)) { exit 0 }

$data = $null
try { $data = $stdin | ConvertFrom-Json -ErrorAction Stop } catch {
    [Console]::Error.WriteLine("post_write_test_required: invalid JSON on stdin")
    exit 0
}

# -- Extract file path --------------------------------------------------------
$filePath = $null
if ($data.tool_input) {
    if ($data.tool_input.file_path) { $filePath = $data.tool_input.file_path }
    elseif ($data.tool_input.filePath) { $filePath = $data.tool_input.filePath }
}
if ([string]::IsNullOrWhiteSpace($filePath)) { exit 0 }

# -- Extension guard - only .ts / .tsx -----------------------------------------
if ($filePath -notmatch '\.(tsx?)$') { exit 0 }

# -- Skip files that don't need tests -----------------------------------------
if ($filePath -match '\.(test|spec)\.(tsx?)$') { exit 0 }
if ($filePath -match '\.d\.ts$') { exit 0 }
if ($filePath -match '\.config\.') { exit 0 }

$normalized = $filePath -replace '\\', '/'
if ($normalized -notmatch '/src/') { exit 0 }
if ($normalized -match '/types/') { exit 0 }

$filename = [System.IO.Path]::GetFileName($filePath)
if ($filename -match '^index\.(tsx?)$') { exit 0 }
if ($normalized -match '/_test_mocks/') { exit 0 }

# -- Check file size (too small to meaningfully test) --------------------------
if (Test-Path $filePath) {
    $lineCount = (Get-Content $filePath -ErrorAction SilentlyContinue |
        Where-Object { $_.Trim() -ne '' } | Measure-Object).Count
    if ($lineCount -lt 10) { exit 0 }
}

# -- Check for co-located test file --------------------------------------------
$dir  = [System.IO.Path]::GetDirectoryName($filePath)
$name = [System.IO.Path]::GetFileNameWithoutExtension($filePath)
$ext  = [System.IO.Path]::GetExtension($filePath)

$colocated  = Join-Path $dir "${name}.test${ext}"
$testsDir   = Join-Path $dir '__tests__'
$underTests = Join-Path $testsDir "${name}.test${ext}"

if ((Test-Path $colocated) -or (Test-Path $underTests)) { exit 0 }

# -- No test file - block agent ------------------------------------------------
[Console]::Error.WriteLine("BLOCKED - New source file has no tests: ${filename}")
[Console]::Error.WriteLine("Create ${name}.test${ext} with smoke tests covering the acceptance criteria.")
[Console]::Error.WriteLine("Co-locate it at: ${colocated}")
exit 2