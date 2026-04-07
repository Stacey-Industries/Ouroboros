#!/usr/bin/env bash
# Ouroboros generic hook — forwards any Claude Code hook event to the IDE.
#
# Usage: generic_hook.sh --type <event_type>
#
# Reads event data from stdin (JSON), wraps it as an NDJSON payload
# with the given --type, and sends to the Ouroboros TCP server.
# Used for events that don't need custom main-process handling
# (TaskCreated, Elicitation, CwdChanged, etc.).
# Exits silently if Ouroboros is not running.

set -euo pipefail

# ── Parse arguments ──────────────────────────────────────────────────────────
TYPE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --type) TYPE="$2"; shift 2 ;;
        *) shift ;;
    esac
done
[[ -z "$TYPE" ]] && exit 0

# ── Configuration ────────────────────────────────────────────────────────────
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

# ── Read stdin ───────────────────────────────────────────────────────────────
stdin_data=""
if read -t "$TIMEOUT" -r line 2>/dev/null; then
    stdin_data="$line"
    while IFS= read -t 0.05 -r more 2>/dev/null; do
        stdin_data="${stdin_data}
${more}"
    done
fi

# ── Extract session_id (stdin JSON preferred, env var fallback) ──────────────
session_id="${CLAUDE_SESSION_ID:-unknown}"

if [ -n "$stdin_data" ]; then
    if command -v jq &>/dev/null; then
        parsed=$(printf '%s' "$stdin_data" | jq -r '.session_id // empty' 2>/dev/null || echo "")
        [ -n "$parsed" ] && session_id="$parsed"
    elif command -v python3 &>/dev/null; then
        parsed=$(printf '%s' "$stdin_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('session_id', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")
        [ -n "$parsed" ] && session_id="$parsed"
    fi
fi

# ── Timestamp helper (portable: GNU/Linux, macOS/Perl, Python3 fallback) ────
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

# ── Build payload ────────────────────────────────────────────────────────────
timestamp_ms=$(get_timestamp_ms)

# JSON-escape the session ID
if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
else
    j_session="\"${session_id}\""
fi

# Build JSON — include stdin data as the 'data' field if available
data_field=""
if [ -n "$stdin_data" ]; then
    if command -v jq &>/dev/null; then
        compact=$(printf '%s' "$stdin_data" | jq -c '.' 2>/dev/null || echo "null")
        data_field=",\"data\":${compact}"
    elif command -v python3 &>/dev/null; then
        compact=$(printf '%s' "$stdin_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(json.dumps(d, separators=(',',':')))
except Exception:
    print('null')
" 2>/dev/null || echo "null")
        data_field=",\"data\":${compact}"
    fi
fi

internal_field=""
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then
    internal_field=",\"internal\":true"
fi

payload="{\"type\":\"${TYPE}\",\"sessionId\":${j_session},\"timestamp\":${timestamp_ms}${data_field}${internal_field}}"
auth_line='{"auth":"'"${OUROBOROS_HOOKS_TOKEN:-}"'"}'$'\n'
ndjson_line="${auth_line}${payload}"$'\n'

# ── Send helper ──────────────────────────────────────────────────────────────
send_payload() {
    local data="$1"

    # Try Unix domain socket first
    if [ -S "$SOCKET_PATH" ] && command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -U -w 1 "$SOCKET_PATH" 2>/dev/null && return 0
    fi

    # Try TCP via nc
    if command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -w 1 "$TCP_HOST" "$TCP_PORT" 2>/dev/null && return 0
    fi

    # Try bash /dev/tcp
    if (printf '%s' "$data" > /dev/tcp/"$TCP_HOST"/"$TCP_PORT") 2>/dev/null; then
        return 0
    fi

    # Try curl as last resort
    if command -v curl &>/dev/null; then
        printf '%s' "$data" | curl -s --max-time 1 \
            --data-binary @- \
            "http://${TCP_HOST}:${TCP_PORT}/" 2>/dev/null
    fi

    return 0
}

send_payload "$ndjson_line" || true
exit 0
