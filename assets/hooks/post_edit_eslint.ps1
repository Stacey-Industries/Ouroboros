#Requires -Version 5.1
<#
.SYNOPSIS
    PostToolUse hook — runs ESLint on edited TypeScript files.
.DESCRIPTION
    After Edit or Write tools, lints the changed file and surfaces
    violations so Claude can fix them in the same turn.
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

# ── Skip test files ──────────────────────────────────────────────────────────
if ($filePath -match '\.(test|spec)\.(tsx?)$') { exit 0 }

# ── Skip declaration files ───────────────────────────────────────────────────
if ($filePath -match '\.d\.ts$') { exit 0 }

# ── Run ESLint ───────────────────────────────────────────────────────────────
$filename = [System.IO.Path]::GetFileName($filePath)

try {
    $output = & npx eslint --no-warn-ignored $filePath 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
} catch {
    exit 0
}

if ($exitCode -ne 0 -and -not [string]::IsNullOrWhiteSpace($output)) {
    $lines = $output -split "`n" | Where-Object { $_.Trim() -ne '' }
    $tail = $lines | Select-Object -Last 20
    Write-Output "ESLint violations in ${filename}:"
    Write-Output ($tail -join "`n")
    exit 1
}

exit 0
