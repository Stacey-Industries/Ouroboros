# statusline_capture.ps1 - Ouroboros IDE statusline script
# Captures Claude Code rate_limits to ~/.ouroboros/claude-usage.json
# and displays a compact status line with model + rate limit info.
#
# Installed by hookInstaller.ts as the Claude Code statusLine command.
# Receives JSON session data on stdin from Claude Code.

$inputText = $input | Out-String
try { $data = $inputText | ConvertFrom-Json } catch { exit 0 }

# -- Capture rate_limits to file ------------------------------------------
if ($data.rate_limits) {
    $dir = Join-Path $env:USERPROFILE '.ouroboros'
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $stamp = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    $payload = @{ rate_limits = $data.rate_limits; captured_at = $stamp }
    $json = $payload | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText((Join-Path $dir 'claude-usage.json'), $json)
}

# -- Output status line ---------------------------------------------------
$model = $data.model.display_name
$parts = @("[$model]")

$ctx = $data.context_window
if ($ctx -and $null -ne $ctx.used_percentage) {
    $pct = [math]::Round($ctx.used_percentage)
    $parts += "ctx:${pct}%"
}

$rl = $data.rate_limits
if ($rl) {
    if ($rl.five_hour) {
        $left = [math]::Round(100 - $rl.five_hour.used_percentage)
        $parts += "5h:${left}%"
    }
    if ($rl.seven_day) {
        $left = [math]::Round(100 - $rl.seven_day.used_percentage)
        $parts += "7d:${left}%"
    }
}

Write-Output ($parts -join ' | ')
