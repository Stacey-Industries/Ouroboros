# run-spike.ps1 — Install test deps and run the embedding spike (Windows PowerShell)
#
# Usage: powershell -ExecutionPolicy Bypass -File spike/run-spike.ps1
#   or:  .\spike\run-spike.ps1   (from project root)
#
# Installs @xenova/transformers temporarily (--no-save) then runs the spike via tsx.
# Model download (~80MB) happens on first run, cached at %USERPROFILE%\.cache\huggingface\hub\.

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "==> Project root: $ProjectRoot"
Set-Location $ProjectRoot

# Check if @xenova/transformers is installed
$transformersInstalled = $false
try {
    node -e "require('@xenova/transformers')" 2>$null
    if ($LASTEXITCODE -eq 0) { $transformersInstalled = $true }
} catch { }

if (-not $transformersInstalled) {
    Write-Host "==> Installing @xenova/transformers (--no-save)..."
    npm install --no-save '@xenova/transformers'
    Write-Host "==> Installed."
} else {
    Write-Host "==> @xenova/transformers already available."
}

Write-Host "==> Running embedding spike..."
Write-Host ""
npx tsx spike/embedding-spike.ts
