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

# ── Check TypeScript types (both tsconfig projects) ──────────────────────────
foreach ($proj in @('tsconfig.web.json', 'tsconfig.node.json')) {
    try {
        $tscOut = & npx tsc --noEmit -p $proj 2>&1 | Out-String
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
}

# ── Check for new hardcoded colors in renderer files ────────────────────────
$rendererFiles = $fileList | Where-Object { $_ -match '^src/renderer/' -and $_ -match '\.(tsx?)$' }
if ($rendererFiles.Count -gt 0) {
    # Get only the added/changed lines (+ lines) in staged diff for renderer files
    $colorHits = @()
    foreach ($rf in $rendererFiles) {
        $diffLines = & git diff --cached -U0 -- $rf 2>&1 | Out-String
        # Match added lines containing hardcoded hex or rgb/rgba (skip var() references and token definitions)
        $addedLines = $diffLines -split "`n" | Where-Object { $_ -match '^\+[^+]' }
        foreach ($line in $addedLines) {
            # Skip lines that are token definitions, var() references, comments, or imports
            if ($line -match 'var\(--' -or $line -match '^\+\s*//' -or $line -match '^\+\s*\*' -or $line -match 'tokens\.css' -or $line -match '@theme') { continue }
            # Detect hardcoded hex colors (#xxx, #xxxxxx, #xxxxxxxx) but not in comments or anchors
            if ($line -match '#[0-9a-fA-F]{3,8}\b' -and $line -notmatch 'eslint-disable' -and $line -notmatch '// hardcoded:') {
                $colorHits += "  [color] $rf -- hardcoded hex: $($line.Trim().Substring(1))"
            }
            # Detect rgb()/rgba() but not inside var() or as token definition
            if ($line -match 'rgba?\(' -and $line -notmatch 'var\(' -and $line -notmatch 'eslint-disable' -and $line -notmatch '// hardcoded:') {
                $colorHits += "  [color] $rf -- hardcoded rgba: $($line.Trim().Substring(1))"
            }
        }
    }
    if ($colorHits.Count -gt 0) {
        $violations += ""
        $violations += "  [color] New hardcoded colors in renderer files. Use design tokens instead."
        $violations += "  [color] See: src/renderer/styles/tokens.css and .claude/rules/renderer.md"
        $violations += "  [color] Add '// hardcoded: <reason>' comment to suppress for intentional exceptions."
        $violations += ""
        $violations += $colorHits
    }
}

# ── Report ───────────────────────────────────────────────────────────────────
if ($violations.Count -eq 0) { exit 0 }

[Console]::Error.WriteLine("Commit blocked -- staged file violations ($($fileList.Count) files checked):")
[Console]::Error.WriteLine("")
[Console]::Error.WriteLine(($violations -join "`n"))
exit 2
