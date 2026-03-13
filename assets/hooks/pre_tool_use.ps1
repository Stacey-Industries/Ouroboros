#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros hook — fires before Claude Code executes a tool.
.DESCRIPTION
    Reads tool call data from stdin (JSON), connects to the Ouroboros
    named pipe, and sends a pre_tool_use event with a unique requestId.
    If approval is required, polls for a response file before exiting.
    Exits silently if Ouroboros is not running.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# ── Configuration ─────────────────────────────────────────────────────────────
$PipeName   = '\\.\pipe\agent-ide-hooks'
$TcpHost    = '127.0.0.1'
$TcpPort    = 3333
$TimeoutMs  = 800   # total budget for initial send
$ApprovalsDir = Join-Path $env:USERPROFILE '.ouroboros\approvals'
$PollIntervalMs = 500
$MaxPollSeconds = 120  # max time to wait for approval

# ── Read stdin ────────────────────────────────────────────────────────────────
$stdinData = $null
try {
    $stdinData = [Console]::In.ReadToEnd()
} catch {
    exit 0
}

if ([string]::IsNullOrWhiteSpace($stdinData)) { exit 0 }

$toolInput = $null
try {
    $toolInput = $stdinData | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

# ── Generate unique request ID ───────────────────────────────────────────────
$requestId = [System.Guid]::NewGuid().ToString('N').Substring(0, 16)

# ── Build payload ─────────────────────────────────────────────────────────────
$sessionId = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { 'unknown' }
$toolName  = if ($toolInput.tool_name) { $toolInput.tool_name } `
             elseif ($toolInput.toolName) { $toolInput.toolName } `
             else { 'unknown' }

$payload = [ordered]@{
    type      = 'pre_tool_use'
    sessionId = $sessionId
    toolName  = $toolName
    input     = $toolInput
    requestId = $requestId
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

$line = ($payload | ConvertTo-Json -Compress -Depth 10) + "`n"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($line)

# ── Send via named pipe ───────────────────────────────────────────────────────
$sent = $false

try {
    $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
        '.', 'agent-ide-hooks',
        [System.IO.Pipes.PipeDirection]::Out,
        [System.IO.Pipes.PipeOptions]::None
    )
    $pipe.Connect($TimeoutMs)
    $pipe.Write($bytes, 0, $bytes.Length)
    $pipe.Flush()
    $pipe.Dispose()
    $sent = $true
} catch {
    # Named pipe unavailable — try TCP
}

if (-not $sent) {
    try {
        $tcp    = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect($TcpHost, $TcpPort, $null, $null)
        $ok     = $result.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($ok -and $tcp.Connected) {
            $stream = $tcp.GetStream()
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush()
            $stream.Dispose()
            $sent = $true
        }
        $tcp.Dispose()
    } catch {
        # Ouroboros not running — exit silently
    }
}

# If we couldn't reach Ouroboros, approve by default
if (-not $sent) { exit 0 }

# ── Poll for approval response ────────────────────────────────────────────────
$responsePath = Join-Path $ApprovalsDir "$requestId.response"
$elapsed = 0

while ($elapsed -lt ($MaxPollSeconds * 1000)) {
    if (Test-Path $responsePath) {
        try {
            $responseText = Get-Content -Path $responsePath -Raw -ErrorAction Stop
            $response = $responseText | ConvertFrom-Json -ErrorAction Stop

            # Clean up response file
            Remove-Item -Path $responsePath -Force -ErrorAction SilentlyContinue

            if ($response.decision -eq 'reject') {
                # Output rejection reason for Claude Code
                $reason = if ($response.reason) { $response.reason } else { 'Rejected by user in Ouroboros IDE' }
                Write-Output $reason
                exit 2
            }

            # Approved
            exit 0
        } catch {
            # File might be partially written — wait and retry
            Start-Sleep -Milliseconds $PollIntervalMs
            $elapsed += $PollIntervalMs
            continue
        }
    }

    Start-Sleep -Milliseconds $PollIntervalMs
    $elapsed += $PollIntervalMs
}

# Timeout — approve by default to avoid blocking Claude Code indefinitely
exit 0
