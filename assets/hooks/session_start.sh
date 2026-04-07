#!/usr/bin/env bash
# Ouroboros hook — fires when a Claude Code session starts.
#
# Reads session data from stdin (JSON), extracts the session ID,
# and sends a session_start event to Ouroboros so it can track the
# Claude session UUID for --resume support on app restart.
# Exits silently if Ouroboros is not running.

set -euo pipefail

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

# ── Read stdin ────────────────────────────────────────────────────────────────
stdin_data=""
if read -t "$TIMEOUT" -r line 2>/dev/null; then
    stdin_data="$line"
    while IFS= read -t 0.05 -r more 2>/dev/null; do
        stdin_data="${stdin_data}
${more}"
    done
fi

# ── Extract session_id (stdin JSON preferred, env var fallback) ───────────────
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

# ── Build payload ─────────────────────────────────────────────────────────────
timestamp_ms=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "0")

if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
else
    j_session="\"${session_id}\""
fi

payload="{\"type\":\"session_start\",\"sessionId\":${j_session},\"timestamp\":${timestamp_ms}"
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then payload="${payload},\"internal\":true"; fi
if [ "${OUROBOROS_IDE_SESSION:-}" = "1" ]; then payload="${payload},\"ideSpawned\":true"; fi
payload="${payload}}"
auth_line='{"auth":"'"${OUROBOROS_HOOKS_TOKEN:-}"'"}'$'\n'
ndjson_line="${auth_line}${payload}"$'\n'

# ── Send helper ───────────────────────────────────────────────────────────────
send_payload() {
    local data="$1"

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
