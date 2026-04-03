#!/usr/bin/env bash
# Ouroboros hook — fires when a Claude Code session stops.
#
# Reads session data from stdin (JSON), extracts the session ID,
# and sends a session_stop event to Ouroboros so the Agent Monitor
# marks the session as complete. Exits silently if Ouroboros is not running.

set -euo pipefail

# Chat sessions are tracked by the agent monitor via agent_end synthetic events.
if [ "${OUROBOROS_CHAT_SESSION:-}" = "1" ]; then exit 0; fi

SOCKET_PATH="${TMPDIR:-/tmp}/agent-ide-hooks.sock"
TCP_HOST="127.0.0.1"
TCP_PORT="${AGENT_IDE_HOOKS_PORT:-3333}"
TIMEOUT=1

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
else
    j_session="\"${session_id}\""
    j_cwd="\"$(pwd)\""
fi

payload="{\"type\":\"session_stop\",\"sessionId\":${j_session},\"timestamp\":${timestamp_ms},\"cwd\":${j_cwd}}"
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then
    payload="{\"type\":\"session_stop\",\"sessionId\":${j_session},\"timestamp\":${timestamp_ms},\"cwd\":${j_cwd},\"internal\":true}"
fi
ndjson_line="${payload}"$'\n'

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
