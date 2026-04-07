#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros hook - fires when a Claude Code session starts.
.DESCRIPTION
    Reads session data from stdin (JSON), extracts the session ID,
    and sends a session_start event to Ouroboros so it can track the
    Claude session UUID for --resume support on app restart.
    Exits silently if Ouroboros is not running.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# -- Chat sessions are tracked by the agent monitor via agent_start hooks ------
# Suppress session_start for chat-spawned processes to avoid duplicate sessions.
if ($env:OUROBOROS_CHAT_SESSION -eq '1') { exit 0 }

# -- Configuration -------------------------------------------------------------
$PipeName  = '\\.\pipe\agent-ide-hooks'
$TcpHost   = '127.0.0.1'
$TcpPort   = 3333
$TimeoutMs = 800

# Override from env if Ouroboros injected the address at PTY spawn time
if ($env:OUROBOROS_HOOKS_ADDRESS) {
    $addr = $env:OUROBOROS_HOOKS_ADDRESS
    if ($addr -match '^(\d+)$') {
        $TcpPort = [int]$addr
    } elseif ($addr -match '^(.+):(\d+)$') {
        $TcpHost = $Matches[1]
        $TcpPort = [int]$Matches[2]
    }
}

# -- Read stdin ----------------------------------------------------------------
$stdinData = $null
try {
    $stdinData = [Console]::In.ReadToEnd()
} catch {
    # stdin unavailable - fall back to env var
}

# Try to get session_id from stdin JSON first, then env var
$sessionId = $null
if (-not [string]::IsNullOrWhiteSpace($stdinData)) {
    try {
        $parsed = $stdinData | ConvertFrom-Json -ErrorAction Stop
        if ($parsed.session_id) { $sessionId = $parsed.session_id }
    } catch { }
}
if (-not $sessionId) {
    $sessionId = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { 'unknown' }
}

# -- Build payload -------------------------------------------------------------
$payload = [ordered]@{
    type      = 'session_start'
    sessionId = $sessionId
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

if ($env:OUROBOROS_INTERNAL -eq '1') { $payload['internal'] = $true }
if ($env:OUROBOROS_IDE_SESSION -eq '1') { $payload['ideSpawned'] = $true }

$line  = ($payload | ConvertTo-Json -Compress -Depth 10) + "`n"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($line)

# Auth line — required by the IDE's pipe auth protocol
$authLine  = '{"auth":"' + $env:OUROBOROS_HOOKS_TOKEN + '"}' + "`n"
$authBytes = [System.Text.Encoding]::UTF8.GetBytes($authLine)

# -- Send via named pipe -------------------------------------------------------
$sent = $false

try {
    $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
        '.', 'agent-ide-hooks',
        [System.IO.Pipes.PipeDirection]::Out,
        [System.IO.Pipes.PipeOptions]::None
    )
    $pipe.Connect($TimeoutMs)
    $pipe.Write($authBytes, 0, $authBytes.Length)  # auth first
    $pipe.Write($bytes, 0, $bytes.Length)
    $pipe.Flush()
    $pipe.Dispose()
    $sent = $true
} catch {
    # Named pipe unavailable - try TCP
}

if (-not $sent) {
    try {
        $tcp    = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect($TcpHost, $TcpPort, $null, $null)
        $ok     = $result.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($ok -and $tcp.Connected) {
            $stream = $tcp.GetStream()
            $stream.Write($authBytes, 0, $authBytes.Length)  # auth first
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush()
            $stream.Dispose()
        }
        $tcp.Dispose()
    } catch {
        # Ouroboros not running - exit silently
    }
}

exit 0
