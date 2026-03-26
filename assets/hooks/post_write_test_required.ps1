#Requires -Version 5.1
<#
.SYNOPSIS
    PostToolUse hook — requires test file creation for new source files.
.DESCRIPTION
    After Write tool creates a new source file, checks whether a co-located
    test file exists. If not, blocks the agent until tests are created.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# ── Read stdin ────────────────────────────────────────────────────────────────
$stdin = $null
try { $stdin = [Console]::In.ReadToEnd() } catch { exit 0 }
if ([string]::IsNullOrWhiteSpace($stdin)) { exit 0 }

$data = $null
try { $data = $stdin | ConvertFrom-Json -ErrorAction Stop } catch { exit 0 }

# ── Extract file path ────────────────────────────────────────────────────────
$filePath = $null
if ($data.tool_input -and $data.tool_input.file_path) {
    $filePath = $data.tool_input.file_path
}
if ([string]::IsNullOrWhiteSpace($filePath)) { exit 0 }

# ── Extension guard — only .ts / .tsx ─────────────────────────────────────────
if ($filePath -notmatch '\.(tsx?)$') { exit 0 }

# ── Skip files that don't need tests ─────────────────────────────────────────

# Already a test file
if ($filePath -match '\.(test|spec)\.(tsx?)$') { exit 0 }

# Type declarations
if ($filePath -match '\.d\.ts$') { exit 0 }

# Config files
if ($filePath -match '\.config\.') { exit 0 }

# Files outside src/
$normalized = $filePath -replace '\\', '/'
if ($normalized -notmatch '/src/') { exit 0 }

# Type-only directories
if ($normalized -match '/types/') { exit 0 }

# Barrel / index files (just re-exports)
$filename = [System.IO.Path]::GetFileName($filePath)
if ($filename -match '^index\.(tsx?)$') { exit 0 }

# Mock files
if ($normalized -match '/_test_mocks/') { exit 0 }

# Files under 10 non-empty lines (too small to meaningfully test)
if (Test-Path $filePath) {
    $lineCount = (Get-Content $filePath | Where-Object { $_.Trim() -ne '' } | Measure-Object).Count
    if ($lineCount -lt 10) { exit 0 }
}

# ── Check for co-located test file ────────────────────────────────────────────
$dir  = [System.IO.Path]::GetDirectoryName($filePath)
$name = [System.IO.Path]::GetFileNameWithoutExtension($filePath)
$ext  = [System.IO.Path]::GetExtension($filePath)

$colocated  = Join-Path $dir "${name}.test${ext}"
$testsDir   = Join-Path $dir '__tests__'
$underTests = Join-Path $testsDir "${name}.test${ext}"

if ((Test-Path $colocated) -or (Test-Path $underTests)) { exit 0 }

# ── No test file — block and instruct ────────────────────────────────────────
Write-Output "New source file has no tests: ${filename}"
Write-Output "Create ${name}.test${ext} with smoke tests covering the acceptance criteria."
Write-Output "Co-locate it at: ${colocated}"
exit 1
