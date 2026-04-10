#Requires -Version 5.1
<#
.SYNOPSIS
    PreToolUse hook - blocks git commit if staged files have lint/format violations.
.DESCRIPTION
    When the Bash tool runs a git commit command, checks staged .ts/.tsx files
    with prettier (formatting), eslint (lint rules), and tsc --noEmit (type errors).
    Exits 2 (BLOCK) if violations are found, 0 otherwise.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# -- Read stdin ----------------------------------------------------------------
$stdin = $null
try { $stdin = [Console]::In.ReadToEnd() } catch {
    [Console]::Error.WriteLine("pre_commit_lint: failed to read stdin: $_")
    exit 0
}
if ([string]::IsNullOrWhiteSpace($stdin)) { exit 0 }

$data = $null
try { $data = $stdin | ConvertFrom-Json -ErrorAction Stop } catch {
    [Console]::Error.WriteLine("pre_commit_lint: invalid JSON on stdin")
    exit 0
}

# -- Extract command ----------------------------------------------------------
$command = $null
if ($data.tool_input -and $data.tool_input.command) {
    $command = $data.tool_input.command
}
if ([string]::IsNullOrWhiteSpace($command)) { exit 0 }

# -- Only intercept git commit ------------------------------------------------
if ($command -notmatch '\bgit\s+commit\b') { exit 0 }

# -- Resolve project root from cwd or git --------------------------------------
$projectRoot = $null
try {
    $gitRoot = & git rev-parse --show-toplevel 2>&1
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($gitRoot)) {
        $projectRoot = $gitRoot.Trim()
    }
} catch { }

if (-not $projectRoot -or -not (Test-Path (Join-Path $projectRoot 'package.json'))) {
    [Console]::Error.WriteLine("pre_commit_lint: could not resolve project root with package.json")
    exit 0
}

Push-Location $projectRoot

try {
    # -- Get staged .ts/.tsx files ---------------------------------------------
    $stagedFiles = & git diff --cached --name-only --diff-filter=d -- '*.ts' '*.tsx' 2>&1
    if ([string]::IsNullOrWhiteSpace($stagedFiles)) {
        Pop-Location
        exit 0
    }

    $fileList = $stagedFiles -split "`n" | Where-Object { $_.Trim() -ne '' }
    if ($fileList.Count -eq 0) {
        Pop-Location
        exit 0
    }

    # Verify npx is available
    $npxPath = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npxPath) {
        [Console]::Error.WriteLine("pre_commit_lint: npx not found in PATH")
        Pop-Location
        exit 0
    }

    $violations = @()

    # -- Check prettier formatting ---------------------------------------------
    try {
        $prettierOut = & npx prettier --check @fileList 2>&1 | Out-String
        $prettierExit = $LASTEXITCODE
    } catch {
        [Console]::Error.WriteLine("pre_commit_lint: prettier execution failed: $_")
        $prettierExit = 0
    }

    if ($prettierExit -ne 0 -and -not [string]::IsNullOrWhiteSpace($prettierOut)) {
        $unformatted = $prettierOut -split "`n" |
            Where-Object { $_ -match '\.(tsx?)$' -and $_ -notmatch 'Checking' -and $_.Trim() -ne '' }
        foreach ($f in $unformatted) {
            $violations += "  [prettier] $($f.Trim()) -- needs formatting (run: npx prettier --write)"
        }
    }

    # -- Check eslint ----------------------------------------------------------
    try {
        $eslintOut = & npx eslint --no-warn-ignored @fileList 2>&1 | Out-String
        $eslintExit = $LASTEXITCODE
    } catch {
        [Console]::Error.WriteLine("pre_commit_lint: eslint execution failed: $_")
        $eslintExit = 0
    }

    if ($eslintExit -ne 0 -and -not [string]::IsNullOrWhiteSpace($eslintOut)) {
        $eslintLines = $eslintOut -split "`n" | Where-Object { $_.Trim() -ne '' }
        foreach ($line in $eslintLines) {
            $violations += "  $line"
        }
    }

    # -- Check TypeScript types (both tsconfig projects) -----------------------
    foreach ($proj in @('tsconfig.web.json', 'tsconfig.node.json')) {
        if (-not (Test-Path $proj)) { continue }

        try {
            $tscOut = & npx tsc --noEmit -p $proj 2>&1 | Out-String
            $tscExit = $LASTEXITCODE
        } catch {
            [Console]::Error.WriteLine("pre_commit_lint: tsc ($proj) execution failed: $_")
            $tscExit = 0
        }

        if ($tscExit -ne 0 -and -not [string]::IsNullOrWhiteSpace($tscOut)) {
            $tscLines = $tscOut -split "`n" | Where-Object { $_.Trim() -ne '' }
            foreach ($line in $tscLines) {
                $violations += "  [tsc:$proj] $line"
            }
        }
    }

    # -- Check for new hardcoded colors in renderer files ----------------------
    $rendererFiles = $fileList | Where-Object { $_ -match '^src/renderer/' -and $_ -match '\.(tsx?)$' }
    if ($rendererFiles.Count -gt 0) {
        $colorHits = @()
        foreach ($rf in $rendererFiles) {
            $diffLines = & git diff --cached -U0 -- $rf 2>&1 | Out-String
            $addedLines = $diffLines -split "`n" | Where-Object { $_ -match '^\+[^+]' }
            foreach ($line in $addedLines) {
                if ($line -match 'var\(--' -or $line -match '^\+\s*//' -or $line -match '^\+\s*\*' -or $line -match 'tokens\.css' -or $line -match '@theme') { continue }
                if ($line -match '#[0-9a-fA-F]{3,8}\b' -and $line -notmatch 'eslint-disable' -and $line -notmatch '// hardcoded:') {
                    $colorHits += "  [color] $rf -- hardcoded hex: $($line.Trim().Substring(1))"
                }
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

    # -- Report ----------------------------------------------------------------
    if ($violations.Count -eq 0) {
        Pop-Location
        exit 0
    }

    $summary = "Commit blocked - staged file violations ($($fileList.Count) files checked):`n`n" + ($violations -join "`n")
    # Write to both stderr (Claude Code displays first stderr line) and stdout
    [Console]::Error.WriteLine($summary)
    Write-Output $summary
    Pop-Location
    exit 2

} catch {
    [Console]::Error.WriteLine("pre_commit_lint: unexpected error: $_")
    Pop-Location
    exit 0
}