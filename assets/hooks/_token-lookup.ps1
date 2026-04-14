# _token-lookup.ps1 — Shared token-file path resolution for Ouroboros hook scripts.
# Dot-source this file: . "$PSScriptRoot\_token-lookup.ps1"
#
# Lookup order (first match wins):
#   1. OUROBOROS_TOKEN_FILE env var  (explicit override / test injection)
#   2. Well-known platform path      (matches Electron app.getPath('userData'))
#   3. Caller falls back to OUROBOROS_HOOKS_TOKEN / OUROBOROS_TOOL_TOKEN env vars

function Get-OuroborosTokenFile {
    if ($env:OUROBOROS_TOKEN_FILE) { return $env:OUROBOROS_TOKEN_FILE }
    if ($IsWindows -or $env:OS -eq 'Windows_NT') {
        return Join-Path $env:APPDATA 'Ouroboros\session-tokens.json'
    } elseif ($IsMacOS) {
        return Join-Path $env:HOME 'Library/Application Support/Ouroboros/session-tokens.json'
    } else {
        $cfg = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $env:HOME '.config' }
        return Join-Path $cfg 'Ouroboros/session-tokens.json'
    }
}
