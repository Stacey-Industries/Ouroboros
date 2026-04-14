#!/usr/bin/env bash
# Ouroboros hook — fires when a Claude Code sub-agent completes.
#
# Reads agent end data from stdin (JSON), extracts the session ID,
# and sends an agent_end event to Ouroboros so the Agent Monitor can
# mark the session as complete. Exits silently if Ouroboros is not running.

set -euo pipefail

# Chat sessions are tracked by the chat bridge's synthetic monitor events.
if [ "${OUROBOROS_CHAT_SESSION:-}" = "1" ]; then exit 0; fi

SOCKET_PATH="${TMPDIR:-/tmp}/agent-ide-hooks.sock"
TCP_HOST="127.0.0.1"
TCP_PORT="${AGENT_IDE_HOOKS_PORT:-3333}"
TIMEOUT=1

# Override from OUROBOROS_HOOKS_ADDRESS if Ouroboros injected it at PTY spawn
if [ -n "${OUROBOROS_HOOKS_ADDRESS:-}" ]; then
    case "$OUROBOROS_HOOKS_ADDRESS" in
        *:*) TCP_HOST="${OUROBOROS_HOOKS_ADDRESS%%:*}"; TCP_PORT="${OUROBOROS_HOOKS_ADDRESS##*:}" ;;
        *)   TCP_PORT="$OUROBOROS_HOOKS_ADDRESS" ;;
    esac
fi

# ── Load tokens (disk-first for cross-restart grace, env-var fallback) ────────
# Path resolution order: OUROBOROS_TOKEN_FILE env var → well-known platform path
# → OUROBOROS_HOOKS_TOKEN env var (IDE-spawned sessions).
# shellcheck source=_token-lookup.sh
. "$(dirname "$0")/_token-lookup.sh"
_hooks_token="${OUROBOROS_HOOKS_TOKEN:-}"
_token_file="$(get_ouroboros_token_file)"
if [ -f "$_token_file" ]; then
    if command -v jq &>/dev/null; then
        _file_hooks=$(jq -r '.hooksToken // empty' "$_token_file" 2>/dev/null || true)
    elif command -v python3 &>/dev/null; then
        _file_hooks=$(python3 -c "import json; d=json.load(open('$_token_file')); print(d.get('hooksToken',''))" 2>/dev/null || true)
    fi
    [ -n "${_file_hooks:-}" ] && _hooks_token="$_file_hooks"
fi

# ── Read stdin ────────────────────────────────────────────────────────────────
stdin_data=""
if read -t "$TIMEOUT" -r line 2>/dev/null; then
    stdin_data="$line"
    while IFS= read -t 0.05 -r more 2>/dev/null; do
        stdin_data="${stdin_data}
${more}"
    done
fi

# ── Extract session_id, error, cost from stdin JSON ───────────────────────────
session_id="${CLAUDE_SESSION_ID:-unknown}"
error_msg=""
cost_usd=""

if [ -n "$stdin_data" ]; then
    if command -v jq &>/dev/null; then
        parsed=$(printf '%s' "$stdin_data" | jq -r '.session_id // .sessionId // empty' 2>/dev/null || echo "")
        [ -n "$parsed" ] && session_id="$parsed"
        error_msg=$(printf '%s' "$stdin_data" | jq -r '.error // empty' 2>/dev/null || echo "")
        cost_usd=$(printf '%s' "$stdin_data" | jq -r '.cost_usd // .cost // empty' 2>/dev/null || echo "")
    elif command -v python3 &>/dev/null; then
        _parsed=$(printf '%s' "$stdin_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('session_id') or d.get('sessionId') or '')
    print(d.get('error') or '')
    print(d.get('cost_usd') or d.get('cost') or '')
except Exception:
    print('')
    print('')
    print('')
" 2>/dev/null)
        if [ -n "$_parsed" ]; then
            _sid=$(printf '%s' "$_parsed" | sed -n '1p')
            _err=$(printf '%s' "$_parsed" | sed -n '2p')
            _cost=$(printf '%s' "$_parsed" | sed -n '3p')
            [ -n "$_sid" ] && session_id="$_sid"
            error_msg="${_err}"
            cost_usd="${_cost}"
        fi
    fi
fi

# Parent session = the session that spawned this subagent (from env var)
parent_session_id="${CLAUDE_SESSION_ID:-}"

# ── Timestamp helper (portable: GNU/Linux, macOS/Perl, Python3 fallback) ─────
get_timestamp_ms() {
    local ts
    # GNU coreutils (Linux) — %3N is milliseconds
    ts=$(date +%s%3N 2>/dev/null) && [ ${#ts} -gt 10 ] && echo "$ts" && return
    # Perl — present by default on macOS, fast
    ts=$(perl -MTime::HiRes -e 'printf "%d\n", Time::HiRes::time()*1000' 2>/dev/null) && echo "$ts" && return
    # Python3 — universal fallback
    ts=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null) && echo "$ts" && return
    # Last resort: second-precision
    echo "$(date +%s)000"
}

# ── Build payload ─────────────────────────────────────────────────────────────
timestamp_ms=$(get_timestamp_ms)

if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_cwd=$(pwd | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')
    j_parent=""
    if [ -n "$parent_session_id" ]; then
        j_parent=$(printf '%s' "$parent_session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    fi
    j_error=""
    if [ -n "$error_msg" ]; then
        j_error=$(printf '%s' "$error_msg" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    fi
    j_cost=""
    if [ -n "$cost_usd" ]; then
        j_cost="$cost_usd"
    fi
else
    j_session="\"${session_id}\""
    j_cwd="\"$(pwd)\""
    j_parent=""
    if [ -n "$parent_session_id" ]; then j_parent="\"${parent_session_id}\""; fi
    j_error=""
    if [ -n "$error_msg" ]; then j_error="\"${error_msg}\""; fi
    j_cost=""
    if [ -n "$cost_usd" ]; then j_cost="$cost_usd"; fi
fi

# Build JSON with optional fields
payload="{\"type\":\"agent_end\",\"sessionId\":${j_session},\"timestamp\":${timestamp_ms},\"cwd\":${j_cwd}"
if [ -n "$j_parent" ]; then payload="${payload},\"parentSessionId\":${j_parent}"; fi
if [ -n "$j_error" ]; then payload="${payload},\"error\":${j_error}"; fi
if [ -n "$j_cost" ]; then payload="${payload},\"costUsd\":${j_cost}"; fi
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then payload="${payload},\"internal\":true"; fi
payload="${payload}}"
auth_line='{"auth":"'"${_hooks_token}"'"}'$'\n'
ndjson_line="${auth_line}${payload}"$'\n'

# ── Send helper ───────────────────────────────────────────────────────────────
send_payload() {
    local data="$1"

    if [ -S "$SOCKET_PATH" ] && command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -U -w 1 "$SOCKET_PATH" 2>/dev/null && return 0
    fi

    if command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -w 1 "$TCP_HOST" "$TCP_PORT" 2>/dev/null && return 0
    fi

    if (printf '%s' "$data" > /dev/tcp/"$TCP_HOST"/"$TCP_PORT") 2>/dev/null; then
        return 0
    fi

    if command -v curl &>/dev/null; then
        printf '%s' "$data" | curl -s --max-time 1 \
            --data-binary @- \
            "http://${TCP_HOST}:${TCP_PORT}/" 2>/dev/null
    fi

    return 0
}

send_payload "$ndjson_line" || true
exit 0
