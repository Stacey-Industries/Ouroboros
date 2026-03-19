#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros hook — fires when a Claude Code session stops.
.DESCRIPTION
    Reads session data from stdin (JSON), extracts the session ID,
    and sends a session_stop event to Ouroboros so the Agent Monitor
    marks the session as complete. Exits silently if Ouroboros is not running.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# ── Configuration ─────────────────────────────────────────────────────────────
$PipeName  = '\\.\pipe\agent-ide-hooks'
$TcpHost   = '127.0.0.1'
$TcpPort   = 3333
$TimeoutMs = 800

# ── Read stdin ────────────────────────────────────────────────────────────────
$stdinData = $null
try {
    $stdinData = [Console]::In.ReadToEnd()
} catch {
    # stdin unavailable
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

# ── Build payload ─────────────────────────────────────────────────────────────
$payload = [ordered]@{
    type      = 'session_stop'
    sessionId = $sessionId
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    cwd       = (Get-Location).Path
}

$line  = ($payload | ConvertTo-Json -Compress -Depth 10) + "`n"
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
        }
        $tcp.Dispose()
    } catch {
        # Ouroboros not running — exit silently
    }
}

exit 0
