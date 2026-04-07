#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros hook - fires after Claude Code executes a tool.
.DESCRIPTION
    Reads tool result data from stdin (JSON), connects to the Ouroboros
    named pipe, and sends a post_tool_use event including output and duration.
    Exits silently if the Ouroboros is not running.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

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
    exit 0
}

if ([string]::IsNullOrWhiteSpace($stdinData)) { exit 0 }

$toolData = $null
try {
    $toolData = $stdinData | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

# -- Build payload -------------------------------------------------------------
# Session ID: for chat sessions, use 'unknown' so hooks.ts inferSessionId()
# maps the event to the synthetic session created by the chat bridge.
$sessionId = $null
if ($env:OUROBOROS_CHAT_SESSION -eq '1') {
    $sessionId = 'unknown'
} else {
    if ($toolData.session_id) { $sessionId = $toolData.session_id }
    elseif ($toolData.sessionId) { $sessionId = $toolData.sessionId }
    if (-not $sessionId) {
        $sessionId = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { 'unknown' }
    }
}
$toolName   = if ($toolData.tool_name)     { $toolData.tool_name }     `
              elseif ($toolData.toolName)  { $toolData.toolName }      `
              else                         { 'unknown' }

# Duration may be provided by Claude Code in env or in the JSON body
$durationMs = $null
if ($env:CLAUDE_TOOL_DURATION_MS) {
    $parsed = 0
    if ([int]::TryParse($env:CLAUDE_TOOL_DURATION_MS, [ref]$parsed)) {
        $durationMs = $parsed
    }
} elseif ($toolData.duration_ms) {
    $durationMs = $toolData.duration_ms
}

# Output/result field - Claude Code may use different key names
$output = if ($toolData.output)       { $toolData.output }       `
          elseif ($toolData.result)   { $toolData.result }       `
          elseif ($toolData.response) { $toolData.response }     `
          else                        { $toolData }

$payload = [ordered]@{
    type      = 'post_tool_use'
    sessionId = $sessionId
    toolName  = $toolName
    output    = $output
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

if ($null -ne $durationMs)               { $payload['durationMs'] = $durationMs }
if ($env:OUROBOROS_INTERNAL -eq '1')     { $payload['internal'] = $true }

$line  = ($payload | ConvertTo-Json -Compress -Depth 10) + "`n"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($line)

# -- Send via named pipe -------------------------------------------------------
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
    # Named pipe unavailable - try TCP
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
        # Ouroboros not running - exit silently
    }
}

exit 0
