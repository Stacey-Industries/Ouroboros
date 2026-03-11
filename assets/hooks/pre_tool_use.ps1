#Requires -Version 5.1
<#
.SYNOPSIS
    Agent IDE hook — fires before Claude Code executes a tool.
.DESCRIPTION
    Reads tool call data from stdin (JSON), connects to the Agent IDE
    named pipe, and sends a pre_tool_use event.
    Exits silently if the Agent IDE is not running.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# ── Configuration ─────────────────────────────────────────────────────────────
$PipeName   = '\\.\pipe\agent-ide-hooks'
$TcpHost    = '127.0.0.1'
$TcpPort    = 3333
$TimeoutMs  = 800   # total budget — must be well under Claude Code's hook timeout

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
        }
        $tcp.Dispose()
    } catch {
        # Agent IDE not running — exit silently
    }
}

exit 0
