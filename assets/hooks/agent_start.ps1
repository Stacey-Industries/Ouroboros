#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros hook — fires when Claude Code spawns a sub-agent.
.DESCRIPTION
    Reads the agent start data from stdin (JSON), extracts a task label
    from the prompt field, and sends an agent_start event to Ouroboros.
    Exits silently if the Ouroboros is not running.
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

# ── Extract subagent session ID and prompt from stdin ────────────────────────
# CLAUDE_SESSION_ID env var = the PARENT session's ID.
# stdin JSON contains the SUBAGENT's data, including its own session_id.
$subagentSessionId = $null
$prompt = $null
$model = $null

if ($agentData) {
    # Subagent's own session ID from stdin
    $subagentSessionId = if ($agentData.session_id) { $agentData.session_id } `
                         elseif ($agentData.sessionId) { $agentData.sessionId } `
                         else { $null }

    # Model identifier
    $model = if ($agentData.model_id) { $agentData.model_id } `
             elseif ($agentData.model) { $agentData.model } `
             else { $null }

    # Claude Code puts the sub-agent's prompt in several possible fields.
    $prompt = if ($agentData.prompt)       { $agentData.prompt }       `
              elseif ($agentData.message)  { $agentData.message }      `
              elseif ($agentData.task)     { $agentData.task }         `
              else                         { $null }
}

# Use subagent's session_id from stdin; fall back to a generated ID if missing
$sessionId = if ($subagentSessionId) { $subagentSessionId } `
             else { 'subagent-' + [System.Guid]::NewGuid().ToString('N').Substring(0, 12) }

# Parent = the session that spawned this subagent (from env var)
$parentSessionId = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { $null }

# Truncate prompt to first 120 chars as the label
$taskLabel = if ($prompt) {
    $trimmed = $prompt.ToString().Trim() -replace '\s+', ' '
    if ($trimmed.Length -gt 120) { $trimmed.Substring(0, 120) + '…' } else { $trimmed }
} else {
    'Sub-agent'
}

# ── Build payload ─────────────────────────────────────────────────────────────
$payload = [ordered]@{
    type            = 'agent_start'
    sessionId       = $sessionId
    taskLabel       = $taskLabel
    timestamp       = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    cwd             = (Get-Location).Path
}

# Add optional fields only if present (avoid null values in JSON)
if ($parentSessionId)                  { $payload['parentSessionId'] = $parentSessionId }
if ($prompt)                           { $payload['prompt'] = $prompt }
if ($model)                            { $payload['model'] = $model }
if ($env:OUROBOROS_INTERNAL -eq '1')   { $payload['internal'] = $true }

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
