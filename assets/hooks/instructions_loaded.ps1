#Requires -Version 5.1
<#
.SYNOPSIS
    Ouroboros hook — fires when Claude Code loads an instruction/rule file.
.DESCRIPTION
    Reads the InstructionsLoaded event data from stdin (JSON), transforms
    it to the IDE wire format, and sends an instructions_loaded event to
    Ouroboros. Exits silently if Ouroboros is not running.
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

$parsed = $null
if (-not [string]::IsNullOrWhiteSpace($stdinData)) {
    try {
        $parsed = $stdinData | ConvertFrom-Json -ErrorAction Stop
    } catch {
        # stdin not valid JSON — exit
        exit 0
    }
}

if (-not $parsed) { exit 0 }

# ── Extract fields ───────────────────────────────────────────────────────────
$sessionId = if ($parsed.session_id) { $parsed.session_id } `
             elseif ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } `
             else { 'unknown' }

$filePath    = if ($parsed.file_path)    { $parsed.file_path }    else { '' }
$memoryType  = if ($parsed.memory_type)  { $parsed.memory_type }  else { 'Project' }
$loadReason  = if ($parsed.load_reason)  { $parsed.load_reason }  else { 'unknown' }

# Globs may be an array or null
$globs = @()
if ($parsed.globs -and ($parsed.globs -is [array])) {
    $globs = $parsed.globs
}

# ── Build payload ─────────────────────────────────────────────────────────────
$inputObj = [ordered]@{
    file_path   = $filePath
    memory_type = $memoryType
    load_reason = $loadReason
}

if ($globs.Count -gt 0) {
    $inputObj['globs'] = $globs
}

$payload = [ordered]@{
    type      = 'instructions_loaded'
    sessionId = $sessionId
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    input     = $inputObj
}

if ($env:OUROBOROS_INTERNAL -eq '1') { $payload['internal'] = $true }

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
