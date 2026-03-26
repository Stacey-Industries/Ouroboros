#Requires -Version 5.1
<#
.SYNOPSIS
    PreToolUse hook -- blocks git commit if staged files have lint/format violations.
.DESCRIPTION
    When the Bash tool runs a git commit command, checks staged .ts/.tsx files
    with prettier (formatting), eslint (lint rules), and tsc --noEmit (type errors).
    This replaces lint-staged so that violations are surfaced to the agent for
    proper fixing. Exits 2 (BLOCK) if violations are found, 0 otherwise.
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

# ── Extract command ──────────────────────────────────────────────────────────
$command = $null
if ($data.tool_input -and $data.tool_input.command) {
    $command = $data.tool_input.command
}
if ([string]::IsNullOrWhiteSpace($command)) { exit 0 }

# ── Only intercept git commit ────────────────────────────────────────────────
if ($command -notmatch '\bgit\s+commit\b') { exit 0 }

# ── Get staged .ts/.tsx files ────────────────────────────────────────────────
$stagedFiles = & git diff --cached --name-only --diff-filter=d -- '*.ts' '*.tsx' 2>&1
if ([string]::IsNullOrWhiteSpace($stagedFiles)) { exit 0 }

$fileList = $stagedFiles -split "`n" | Where-Object { $_.Trim() -ne '' }
if ($fileList.Count -eq 0) { exit 0 }

$violations = @()

# ── Check prettier formatting ────────────────────────────────────────────────
try {
    $quoted = $fileList | ForEach-Object { "`"$_`"" }
    $prettierOut = & npx prettier --check $quoted 2>&1 | Out-String
    $prettierExit = $LASTEXITCODE
} catch {
    $prettierExit = 0
}

if ($prettierExit -ne 0) {
    $unformatted = $prettierOut -split "`n" |
        Where-Object { $_ -match '\.(tsx?)$' -and $_ -notmatch 'Checking' -and $_.Trim() -ne '' }
    foreach ($f in $unformatted) {
        $violations += "  [prettier] $($f.Trim()) -- needs formatting (run: npx prettier --write)"
    }
}

# ── Check eslint ─────────────────────────────────────────────────────────────
try {
    $quoted = $fileList | ForEach-Object { "`"$_`"" }
    $eslintOut = & npx eslint --no-warn-ignored $quoted 2>&1 | Out-String
    $eslintExit = $LASTEXITCODE
} catch {
    $eslintExit = 0
}

if ($eslintExit -ne 0 -and -not [string]::IsNullOrWhiteSpace($eslintOut)) {
    $eslintLines = $eslintOut -split "`n" | Where-Object { $_.Trim() -ne '' }
    foreach ($line in $eslintLines) {
        $violations += "  $line"
    }
}

# ── Check TypeScript types ────────────────────────────────────────────────────
try {
    $tscOut = & npx tsc --noEmit 2>&1 | Out-String
    $tscExit = $LASTEXITCODE
} catch {
    $tscExit = 0
}

if ($tscExit -ne 0 -and -not [string]::IsNullOrWhiteSpace($tscOut)) {
    $tscLines = $tscOut -split "`n" | Where-Object { $_.Trim() -ne '' }
    foreach ($line in $tscLines) {
        $violations += "  [tsc] $line"
    }
}

# ── Report ───────────────────────────────────────────────────────────────────
if ($violations.Count -eq 0) { exit 0 }

[Console]::Error.WriteLine("Commit blocked -- staged file violations ($($fileList.Count) files checked):")
[Console]::Error.WriteLine("")
[Console]::Error.WriteLine(($violations -join "`n"))
exit 2
