#Requires -Version 5.1
<#
.SYNOPSIS
    PostToolUse hook — runs the corresponding test after editing a source file.
.DESCRIPTION
    After Edit or Write tools, finds and runs the matching test file
    (co-located or in __tests__/) so regressions surface immediately.
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

# ── Skip if already a test file ──────────────────────────────────────────────
if ($filePath -match '\.(test|spec)\.(tsx?)$') { exit 0 }

# ── Skip declaration files, config files, and files outside src/ ─────────────
if ($filePath -match '\.d\.ts$') { exit 0 }
if ($filePath -match '\.config\.') { exit 0 }
$normalized = $filePath -replace '\\', '/'
if ($normalized -notmatch '/src/') { exit 0 }

# ── Resolve candidate test paths ────────────────────────────────────────────
$dir  = [System.IO.Path]::GetDirectoryName($filePath)
$name = [System.IO.Path]::GetFileNameWithoutExtension($filePath)
$ext  = [System.IO.Path]::GetExtension($filePath)
$filename = [System.IO.Path]::GetFileName($filePath)

# Co-located: foo.ts → foo.test.ts
$colocated = Join-Path $dir "${name}.test${ext}"

# __tests__ subdir: src/main/foo.ts → src/main/__tests__/foo.test.ts
$testsDir = Join-Path $dir '__tests__'
$underTests = Join-Path $testsDir "${name}.test${ext}"

$testFile = $null
if (Test-Path $colocated)   { $testFile = $colocated }
elseif (Test-Path $underTests) { $testFile = $underTests }

if (-not $testFile) {
    Write-Output "No test file found for ${filename}"
    exit 0
}

# ── Run vitest ───────────────────────────────────────────────────────────────
try {
    $output = & npx vitest run $testFile --reporter=verbose 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
} catch {
    exit 0
}

if ($exitCode -ne 0 -and -not [string]::IsNullOrWhiteSpace($output)) {
    $lines = $output -split "`n" | Where-Object { $_.Trim() -ne '' }
    $tail = $lines | Select-Object -Last 20
    Write-Output ($tail -join "`n")
    exit 1
}

exit 0
