#Requires -Version 5.1
<#
.SYNOPSIS
    PostToolUse hook - runs ESLint on edited TypeScript files.
.DESCRIPTION
    After Edit, Write, or MultiEdit tools, lints the changed file and
    surfaces violations so Claude can fix them in the same turn.
    Exits 2 (BLOCK) on violations - agent cannot proceed until clean.
    Exits 0 on success. Reports errors to stderr for debugging.
#>

param()

Set-StrictMode -Version Latest
# NOT SilentlyContinue - we want to know when things break
$ErrorActionPreference = 'Continue'

# -- Read stdin ----------------------------------------------------------------
$stdin = $null
try { $stdin = [Console]::In.ReadToEnd() } catch {
    [Console]::Error.WriteLine("post_edit_eslint: failed to read stdin: $_")
    exit 0
}
if ([string]::IsNullOrWhiteSpace($stdin)) { exit 0 }

$data = $null
try { $data = $stdin | ConvertFrom-Json -ErrorAction Stop } catch {
    [Console]::Error.WriteLine("post_edit_eslint: invalid JSON on stdin")
    exit 0
}

# -- Extract file path --------------------------------------------------------
$filePath = $null
if ($data.tool_input) {
    if ($data.tool_input.file_path) {
        $filePath = $data.tool_input.file_path
    }
    elseif ($data.tool_input.filePath) {
        $filePath = $data.tool_input.filePath
    }
}
if ([string]::IsNullOrWhiteSpace($filePath)) { exit 0 }

# -- Extension guard - only .ts / .tsx -----------------------------------------
if ($filePath -notmatch '\.(tsx?)$') { exit 0 }

# -- Skip test files, declaration files ----------------------------------------
if ($filePath -match '\.(test|spec)\.(tsx?)$') { exit 0 }
if ($filePath -match '\.d\.ts$') { exit 0 }

# -- Resolve project root (walk up to find package.json) ----------------------
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
    [Console]::Error.WriteLine("post_edit_eslint: could not find package.json above $filePath")
    exit 0
}

# -- Change to project root so npx resolves local node_modules -----------------
Push-Location $projectRoot

try {
    # -- Verify eslint is available --------------------------------------------
    $npxPath = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npxPath) {
        [Console]::Error.WriteLine("post_edit_eslint: npx not found in PATH")
        Pop-Location
        exit 0
    }

    # -- Run ESLint ------------------------------------------------------------
    $filename = [System.IO.Path]::GetFileName($filePath)

    $output = & npx eslint --no-warn-ignored "$filePath" 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0 -and -not [string]::IsNullOrWhiteSpace($output)) {
        $lines = $output -split "`n" | Where-Object { $_.Trim() -ne '' }
        $tail = $lines | Select-Object -Last 20
        Write-Output "BLOCKED - ESLint violations in ${filename}. Fix these before continuing:"
        Write-Output ($tail -join "`n")
        Pop-Location
        exit 2
    }
} catch {
    [Console]::Error.WriteLine("post_edit_eslint: execution error: $_")
} finally {
    Pop-Location
}

exit 0