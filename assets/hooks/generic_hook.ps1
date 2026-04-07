#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros generic hook — forwards any Claude Code hook event to the IDE.
.DESCRIPTION
    Reads event data from stdin (JSON), wraps it as an NDJSON payload
    with the given --type, and sends to the Ouroboros named pipe.
    Used for events that don't need custom main-process handling
    (TaskCreated, Elicitation, CwdChanged, etc.).
    Exits silently if Ouroboros is not running.
.PARAMETER type
    The wire-format event type name (e.g. task_created, elicitation).
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$type
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# -- Configuration -------------------------------------------------------------
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
    # stdin unavailable
}

# -- Parse stdin JSON ----------------------------------------------------------
$parsed = $null
$sessionId = 'unknown'
if (-not [string]::IsNullOrWhiteSpace($stdinData)) {
    try {
        $parsed = $stdinData | ConvertFrom-Json -ErrorAction Stop
        if ($parsed.session_id) { $sessionId = $parsed.session_id }
    } catch { }
}
if ($sessionId -eq 'unknown' -and $env:CLAUDE_SESSION_ID) {
    $sessionId = $env:CLAUDE_SESSION_ID
}

# -- Build payload -------------------------------------------------------------
$payload = [ordered]@{
    type      = $type
    sessionId = $sessionId
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

# Forward all stdin fields as event-specific data
if ($parsed) { $payload['data'] = $parsed }
if ($env:OUROBOROS_INTERNAL -eq '1') { $payload['internal'] = $true }

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

# -- Fallback: TCP -------------------------------------------------------------
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
