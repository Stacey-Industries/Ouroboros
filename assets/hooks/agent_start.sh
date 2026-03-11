#!/usr/bin/env bash
# Ouroboros hook — fires when Claude Code spawns a sub-agent.
#
# Reads agent start data from stdin (JSON), extracts a task label
# from the prompt field, and sends an agent_start event to Ouroboros.
# Exits silently if the Ouroboros is not running.

set -euo pipefail

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

# ── Extract task label from prompt ───────────────────────────────────────────
task_label="Sub-agent"

if [ -n "$stdin_data" ]; then
    if command -v jq &>/dev/null; then
        raw_prompt=$(printf '%s' "$stdin_data" | \
            jq -r '.prompt // .message // .task // empty' 2>/dev/null || echo "")
        if [ -n "$raw_prompt" ]; then
            # Collapse whitespace and truncate to 120 chars
            task_label=$(printf '%s' "$raw_prompt" | tr -s '[:space:]' ' ' | cut -c1-120)
        fi
    elif command -v python3 &>/dev/null; then
        task_label=$(printf '%s' "$stdin_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    p = d.get('prompt') or d.get('message') or d.get('task') or 'Sub-agent'
    p = ' '.join(p.split())
    print(p[:120])
except Exception:
    print('Sub-agent')
" 2>/dev/null || echo "Sub-agent")
    fi
fi

# ── Build payload ─────────────────────────────────────────────────────────────
session_id="${CLAUDE_SESSION_ID:-unknown}"
timestamp_ms=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "0")

if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id"  | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_label=$(printf '%s'   "$task_label"  | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
else
    j_session="\"${session_id}\""
    j_label="\"${task_label}\""
fi

payload="{\"type\":\"agent_start\",\"sessionId\":${j_session},\"taskLabel\":${j_label},\"timestamp\":${timestamp_ms}}"
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
