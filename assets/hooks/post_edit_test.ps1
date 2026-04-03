#Requires -Version 5.1
<#
.SYNOPSIS
    PostToolUse hook - runs the corresponding test after editing a source file.
.DESCRIPTION
    After Edit, Write, or MultiEdit tools, finds and runs the matching test
    file (co-located or in __tests__/) so regressions surface immediately.
    Exits 2 (BLOCK) on test failures - agent cannot proceed until tests pass.

    Includes a debounce: if the same test file ran within the last 30 seconds,
    skips the run to avoid hammering vitest on rapid sequential edits.
    The pre-commit gate catches anything missed.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# -- Read stdin ----------------------------------------------------------------
$stdin = $null
try { $stdin = [Console]::In.ReadToEnd() } catch {
    [Console]::Error.WriteLine("post_edit_test: failed to read stdin: $_")
    exit 0
}
if ([string]::IsNullOrWhiteSpace($stdin)) { exit 0 }

$data = $null
try { $data = $stdin | ConvertFrom-Json -ErrorAction Stop } catch {
    [Console]::Error.WriteLine("post_edit_test: invalid JSON on stdin")
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

# -- Skip if already a test file ----------------------------------------------
if ($filePath -match '\.(test|spec)\.(tsx?)$') { exit 0 }

# -- Skip declaration files, config files, files outside src/ -----------------
if ($filePath -match '\.d\.ts$') { exit 0 }
if ($filePath -match '\.config\.') { exit 0 }
$normalized = $filePath -replace '\\', '/'
if ($normalized -notmatch '/src/') { exit 0 }

# -- Resolve project root -----------------------------------------------------
$projectRoot = $null
$searchDir = [System.IO.Path]::GetDirectoryName((Resolve-Path $filePath -ErrorAction SilentlyContinue))
if (-not $searchDir) { $searchDir = [System.IO.Path]::GetDirectoryName($filePath) }

$current = $searchDir
while ($current -and $current.Length -gt 3) {
    if (Test-Path (Join-Path $current 'package.json')) {
        $projectRoot = $current
        break
    }
    $current = [System.IO.Path]::GetDirectoryName($current)
}

if (-not $projectRoot) {
    [Console]::Error.WriteLine("post_edit_test: could not find package.json above $filePath")
    exit 0
}

# -- Resolve candidate test paths ---------------------------------------------
$dir  = [System.IO.Path]::GetDirectoryName($filePath)
$name = [System.IO.Path]::GetFileNameWithoutExtension($filePath)
$ext  = [System.IO.Path]::GetExtension($filePath)
$filename = [System.IO.Path]::GetFileName($filePath)

$colocated  = Join-Path $dir "${name}.test${ext}"
$testsDir   = Join-Path $dir '__tests__'
$underTests = Join-Path $testsDir "${name}.test${ext}"

$testFile = $null
if (Test-Path $colocated)    { $testFile = $colocated }
elseif (Test-Path $underTests) { $testFile = $underTests }

if (-not $testFile) {
    # No test file - don't block, just note it. post_write_test_required
    # handles enforcement for NEW files.
    exit 0
}

# -- Debounce: skip if this test ran within the last 30 seconds ----------------
$debounceDir = Join-Path (Join-Path (Join-Path $env:USERPROFILE '.claude') 'hooks') 'test-debounce'
if (-not (Test-Path $debounceDir)) {
    New-Item -ItemType Directory -Path $debounceDir -Force | Out-Null
}

# Key by test file path hash to avoid filesystem-unsafe characters
$testFileHash = [System.BitConverter]::ToString(
    [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes($testFile)
    )
).Replace('-', '').Substring(0, 16)
$debounceFile = Join-Path $debounceDir "${testFileHash}.last"

$debounceSec = 30
if (Test-Path $debounceFile) {
    $lastRun = (Get-Item $debounceFile).LastWriteTimeUtc
    $elapsed = ([DateTime]::UtcNow - $lastRun).TotalSeconds
    if ($elapsed -lt $debounceSec) {
        # Recently tested - skip this run, pre-commit will catch it
        exit 0
    }
}

# Touch debounce file BEFORE running (so concurrent hooks also skip)
Set-Content -Path $debounceFile -Value '' -Force -ErrorAction SilentlyContinue

# -- Change to project root ----------------------------------------------------
Push-Location $projectRoot

try {
    $npxPath = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npxPath) {
        [Console]::Error.WriteLine("post_edit_test: npx not found in PATH")
        Pop-Location
        exit 0
    }

    # -- Run vitest ------------------------------------------------------------
    $testFilename = [System.IO.Path]::GetFileName($testFile)

    $output = & npx vitest run "$testFile" --reporter=verbose 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0 -and -not [string]::IsNullOrWhiteSpace($output)) {
        $lines = $output -split "`n" | Where-Object { $_.Trim() -ne '' }
        $tail = $lines | Select-Object -Last 20
        Write-Output "BLOCKED - Test failures in ${testFilename} (triggered by edit to ${filename}). Fix before continuing:"
        Write-Output ($tail -join "`n")
        Pop-Location
        exit 2
    }
} catch {
    [Console]::Error.WriteLine("post_edit_test: execution error: $_")
} finally {
    Pop-Location
}

exit 0