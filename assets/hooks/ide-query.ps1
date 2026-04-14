#Requires -Version 5.1
<#
.SYNOPSIS
    Query the Ouroboros IDE for context from Claude Code hook scripts.
.DESCRIPTION
    Connects to the Ouroboros IDE tool server (named pipe) and sends a
    JSON-RPC request. Returns the JSON response to stdout.
.PARAMETER Method
    The tool method to call (e.g. 'ide.getOpenFiles', 'ide.getActiveFile').
.PARAMETER Params
    Optional JSON string of parameters (e.g. '{"path":"C:\\file.txt"}').
.EXAMPLE
    .\ide-query.ps1 ide.getOpenFiles
    .\ide-query.ps1 ide.getFileContent '{"path":"C:\\src\\main.ts"}'
    .\ide-query.ps1 ide.getGitStatus
    .\ide-query.ps1 ide.getDiagnostics '{"path":"C:\\src\\main.ts"}'
    .\ide-query.ps1 ide.getSelection
    .\ide-query.ps1 ide.getTerminalOutput '{"lines":100}'
    .\ide-query.ps1 ide.ping
#>

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Method,

    [Parameter(Position=1)]
    [string]$Params = '{}'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PipeName = 'ouroboros-tools'
$TimeoutMs = 10000

# -- Load tokens (disk-first for cross-restart grace, env-var fallback) --------
# Path resolution order: OUROBOROS_TOKEN_FILE env var → well-known platform path
# → OUROBOROS_TOOL_TOKEN env var (IDE-spawned sessions).
. "$PSScriptRoot\_token-lookup.ps1"
$toolToken = $env:OUROBOROS_TOOL_TOKEN
$_tokenFile = Get-OuroborosTokenFile
if (-not [string]::IsNullOrEmpty($_tokenFile) -and (Test-Path $_tokenFile)) {
    try {
        $tokenData = Get-Content -Path $_tokenFile -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($tokenData.toolToken) { $toolToken = $tokenData.toolToken }
    } catch { }
}

# Generate a unique request ID
$requestId = [System.Guid]::NewGuid().ToString('N').Substring(0, 16)

# Build the request
$request = @{
    id     = $requestId
    method = $Method
    params = ($Params | ConvertFrom-Json)
} | ConvertTo-Json -Compress -Depth 10

$requestBytes = [System.Text.Encoding]::UTF8.GetBytes($request + "`n")

# Auth line — required by the IDE's tool pipe auth protocol
$authLine  = '{"auth":"' + $toolToken + '"}' + "`n"
$authBytes = [System.Text.Encoding]::UTF8.GetBytes($authLine)

try {
    $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
        '.', $PipeName,
        [System.IO.Pipes.PipeDirection]::InOut,
        [System.IO.Pipes.PipeOptions]::None
    )
    $pipe.Connect($TimeoutMs)

    # Send auth first, then request
    $pipe.Write($authBytes, 0, $authBytes.Length)
    $pipe.Write($requestBytes, 0, $requestBytes.Length)
    $pipe.Flush()

    # Read response
    $reader = New-Object System.IO.StreamReader($pipe, [System.Text.Encoding]::UTF8)
    $responseLine = $reader.ReadLine()

    $pipe.Dispose()

    if ($responseLine) {
        # Parse and pretty-print
        $response = $responseLine | ConvertFrom-Json
        if ($response.error) {
            Write-Error "IDE query error: $($response.error.message)"
            exit 1
        }
        # Output result as JSON
        $response.result | ConvertTo-Json -Depth 20
    } else {
        Write-Error 'No response from IDE'
        exit 1
    }
} catch [System.TimeoutException] {
    Write-Error 'Ouroboros IDE is not running (connection timeout)'
    exit 1
} catch {
    Write-Error "Failed to query IDE: $_"
    exit 1
}
