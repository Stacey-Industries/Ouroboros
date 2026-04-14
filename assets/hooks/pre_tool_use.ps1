#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros hook - fires before Claude Code executes a tool.
.DESCRIPTION
    Reads tool call data from stdin (JSON), connects to the Ouroboros
    named pipe, and sends a pre_tool_use event with a unique requestId.
    If approval is required, polls for a response file before exiting.
    Exits silently if Ouroboros is not running.
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# -- Configuration -------------------------------------------------------------
$PipeName   = '\\.\pipe\agent-ide-hooks'
$TcpHost    = '127.0.0.1'
$TcpPort    = 3333
$TimeoutMs  = 800   # total budget for initial send

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

$ApprovalsDir = Join-Path $env:USERPROFILE '.ouroboros\approvals'
$PollIntervalMs = 500
$MaxPollSeconds = 15  # max time to wait for approval before approving by default

# Skip entirely for sessions not spawned by Ouroboros. The hook is installed
# in the user's global ~/.claude/settings.json so it fires for every Claude
# CLI session on this machine — including standalone ones. Without a valid
# token the server will reject the auth anyway, and the old code still polled
# 120s for an approval that could never arrive. Bail out fast.
if ([string]::IsNullOrEmpty($env:OUROBOROS_HOOKS_TOKEN)) { exit 0 }

# -- Read stdin ----------------------------------------------------------------
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

# -- Generate unique request ID -----------------------------------------------
$requestId = [System.Guid]::NewGuid().ToString('N').Substring(0, 16)

# -- Build payload -------------------------------------------------------------
# Session ID: for chat sessions, use 'unknown' so hooks.ts inferSessionId()
# maps the event to the synthetic session created by the chat bridge. The CLI
# session ID ($CLAUDE_SESSION_ID) differs from the stream-json session_id that
# the bridge uses, so we can't hardcode either one here.
$sessionId = $null
if ($env:OUROBOROS_CHAT_SESSION -eq '1') {
    $sessionId = 'unknown'
} else {
    if ($toolInput.session_id) { $sessionId = $toolInput.session_id }
    elseif ($toolInput.sessionId) { $sessionId = $toolInput.sessionId }
    if (-not $sessionId) {
        $sessionId = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { 'unknown' }
    }
}
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

if ($env:OUROBOROS_INTERNAL -eq '1') { $payload['internal'] = $true }

$line = ($payload | ConvertTo-Json -Compress -Depth 10) + "`n"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($line)

# Auth line — required by the IDE's pipe auth protocol
$authLine  = '{"auth":"' + $env:OUROBOROS_HOOKS_TOKEN + '"}' + "`n"
$authBytes = [System.Text.Encoding]::UTF8.GetBytes($authLine)

# -- Send via named pipe -------------------------------------------------------
$sent = $false

try {
    $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
        '.', 'agent-ide-hooks',
        [System.IO.Pipes.PipeDirection]::InOut,
        [System.IO.Pipes.PipeOptions]::None
    )
    $pipe.Connect($TimeoutMs)
    $pipe.Write($authBytes, 0, $authBytes.Length)  # auth first
    $pipe.Write($bytes, 0, $bytes.Length)
    $pipe.Flush()
    # Detect explicit auth rejection: the server writes
    # '{"error":"unauthorized"}\n' and half-closes. Give it a brief window
    # to respond, then check whether the pipe was closed from the server
    # side. Without this, a buffered write "succeeds" even when the server
    # rejected us, and we used to fall into a 2-minute approval poll.
    Start-Sleep -Milliseconds 150
    if ($pipe.IsConnected) {
        $sent = $true
    }
    $pipe.Dispose()
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
            $sent = $true
        }
        $tcp.Dispose()
    } catch {
        # Ouroboros not running - exit silently
    }
}

# If we couldn't reach Ouroboros, approve by default
if (-not $sent) { exit 0 }

# -- Wait for approval via ideToolServer pipe (primary channel) ----------------
# Uses approval.wait NDJSON request over the ouroboros-tools pipe instead of
# polling the filesystem. Falls back to file-poll if the pipe is unavailable.

$decision = $null
$reason   = $null

if (-not [string]::IsNullOrEmpty($env:OUROBOROS_TOOL_TOKEN)) {
    try {
        $toolPipe = New-Object System.IO.Pipes.NamedPipeClientStream(
            '.', 'ouroboros-tools',
            [System.IO.Pipes.PipeDirection]::InOut,
            [System.IO.Pipes.PipeOptions]::None
        )
        $toolPipe.Connect(2000)

        $toolAuthLine    = '{"auth":"' + $env:OUROBOROS_TOOL_TOKEN + '"}' + "`n"
        $toolAuthBytes   = [System.Text.Encoding]::UTF8.GetBytes($toolAuthLine)
        $waitRequest     = '{"id":"aw-' + $requestId + '","method":"approval.wait","params":{"requestId":"' + $requestId + '","timeoutMs":' + ($MaxPollSeconds * 1000) + '}}' + "`n"
        $waitRequestBytes = [System.Text.Encoding]::UTF8.GetBytes($waitRequest)

        $toolPipe.Write($toolAuthBytes,    0, $toolAuthBytes.Length)
        $toolPipe.Write($waitRequestBytes, 0, $waitRequestBytes.Length)
        $toolPipe.Flush()

        $reader   = New-Object System.IO.StreamReader($toolPipe, [System.Text.Encoding]::UTF8)
        $respLine = $reader.ReadLine()
        $toolPipe.Dispose()

        if ($respLine) {
            $resp = $respLine | ConvertFrom-Json -ErrorAction Stop
            # Unwrap JSON-RPC envelope: { id, result: { decision, reason? } }
            $inner = if ($resp.result) { $resp.result } else { $resp }
            if ($inner.decision) {
                $decision = $inner.decision
                $reason   = $inner.reason
            }
        }
    } catch {
        # Pipe unavailable or timed out — fall through to file-poll fallback below
        $decision = $null
    }
}

if ($decision -ne $null) {
    if ($decision -eq 'reject') {
        $msg = if ($reason) { $reason } else { 'Rejected by user in Ouroboros IDE' }
        [Console]::Error.WriteLine($msg)
        exit 2
    }
    exit 0
}

# -- Fallback: poll for approval response file --------------------------------
# Used when the ideToolServer pipe is unreachable (older IDE, pipe not started,
# or OUROBOROS_TOOL_TOKEN not set). Matches pre-pipe behavior exactly.
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
                # Output rejection reason for Claude Code (stderr so model sees it on exit 2)
                $reason = if ($response.reason) { $response.reason } else { 'Rejected by user in Ouroboros IDE' }
                [Console]::Error.WriteLine($reason)
                exit 2
            }

            # Approved
            exit 0
        } catch {
            # File might be partially written - wait and retry
            Start-Sleep -Milliseconds $PollIntervalMs
            $elapsed += $PollIntervalMs
            continue
        }
    }

    Start-Sleep -Milliseconds $PollIntervalMs
    $elapsed += $PollIntervalMs
}

# Timeout - approve by default to avoid blocking Claude Code indefinitely
exit 0
