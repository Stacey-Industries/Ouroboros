#Requires -Version 5.1
<#
.SYNOPSIS
    Agent IDE hook — fires when Claude Code spawns a sub-agent.
.DESCRIPTION
    Reads the agent start data from stdin (JSON), extracts a task label
    from the prompt field, and sends an agent_start event to Agent IDE.
    Exits silently if the Agent IDE is not running.
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
    exit 0
}

$agentData = $null
if (-not [string]::IsNullOrWhiteSpace($stdinData)) {
    try {
        $agentData = $stdinData | ConvertFrom-Json -ErrorAction Stop
    } catch {
        # stdin not valid JSON — use defaults
    }
}

# ── Extract task label from prompt ───────────────────────────────────────────
# Claude Code puts the sub-agent's prompt in several possible fields.
$prompt = $null
if ($agentData) {
    $prompt = if ($agentData.prompt)       { $agentData.prompt }       `
              elseif ($agentData.message)  { $agentData.message }      `
              elseif ($agentData.task)     { $agentData.task }         `
              else                         { $null }
}

# Truncate to first 120 chars as the label
$taskLabel = if ($prompt) {
    $trimmed = $prompt.ToString().Trim() -replace '\s+', ' '
    if ($trimmed.Length -gt 120) { $trimmed.Substring(0, 120) + '…' } else { $trimmed }
} else {
    'Sub-agent'
}

$sessionId = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { 'unknown' }

# ── Build payload ─────────────────────────────────────────────────────────────
$payload = [ordered]@{
    type      = 'agent_start'
    sessionId = $sessionId
    taskLabel = $taskLabel
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
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
        # Agent IDE not running — exit silently
    }
}

exit 0
