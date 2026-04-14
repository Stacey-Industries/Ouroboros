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

# Kill-switch for rapid iteration sessions.
if ($env:OUROBOROS_SKIP_QUALITY_HOOKS -eq '1') { exit 0 }

# Wall-clock budget. ESLint cold-start on Windows can take 5-15s with a warm
# cache and much longer without. 30s covers the slow path but caps runaway
# invocations before they stall Claude.
$TimeoutSeconds = 30

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

# -- Verify npx is available ---------------------------------------------------
$npxCmd = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npxCmd) {
    [Console]::Error.WriteLine("post_edit_eslint: npx not found in PATH")
    exit 0
}
# Start-Process wants a path to an executable, not a shim name.
$npxFile = $npxCmd.Source

# -- Run ESLint with a wall-clock timeout --------------------------------------
# Start-Process captures to files (no inline pipeline), but gives us a
# Process object we can WaitForExit(ms) on and kill if it hangs.
$filename = [System.IO.Path]::GetFileName($filePath)
$tmpOut = [System.IO.Path]::GetTempFileName()
$tmpErr = [System.IO.Path]::GetTempFileName()

try {
    $proc = Start-Process -FilePath $npxFile `
        -ArgumentList @('eslint', '--no-warn-ignored', $filePath) `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $tmpOut `
        -RedirectStandardError $tmpErr `
        -WorkingDirectory $projectRoot

    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
        # Kill the process tree — npx spawns node which spawns eslint workers.
        try { & taskkill.exe /F /T /PID $proc.Id 2>&1 | Out-Null } catch {}
        [Console]::Error.WriteLine("post_edit_eslint: timed out after ${TimeoutSeconds}s on ${filename}; failing open")
        exit 0
    }

    $exitCode = $proc.ExitCode
    $output = ((Get-Content $tmpOut -Raw -ErrorAction SilentlyContinue) `
             + (Get-Content $tmpErr -Raw -ErrorAction SilentlyContinue))

    if ($exitCode -ne 0 -and -not [string]::IsNullOrWhiteSpace($output)) {
        $lines = $output -split "`n" | Where-Object { $_.Trim() -ne '' }
        $tail = $lines | Select-Object -Last 20
        [Console]::Error.WriteLine("BLOCKED - ESLint violations in ${filename}. Fix these before continuing:")
        [Console]::Error.WriteLine($tail -join "`n")
        exit 2
    }
} catch {
    [Console]::Error.WriteLine("post_edit_eslint: execution error: $_")
} finally {
    Remove-Item $tmpOut, $tmpErr -Force -ErrorAction SilentlyContinue
}

exit 0