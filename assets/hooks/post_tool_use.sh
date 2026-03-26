#!/usr/bin/env bash
# Ouroboros hook — fires after Claude Code executes a tool.
#
# Reads tool result data from stdin (JSON), then sends a post_tool_use
# event to the Ouroboros via Unix domain socket or TCP fallback.
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

# ── Extract fields ────────────────────────────────────────────────────────────
tool_name="unknown"
duration_ms=""

if command -v jq &>/dev/null && [ -n "$stdin_data" ]; then
    tool_name=$(printf '%s' "$stdin_data" | jq -r '.tool_name // .toolName // "unknown"' 2>/dev/null || echo "unknown")
    duration_ms=$(printf '%s' "$stdin_data" | jq -r '.duration_ms // .durationMs // empty' 2>/dev/null || echo "")
elif command -v python3 &>/dev/null && [ -n "$stdin_data" ]; then
    tool_name=$(printf '%s' "$stdin_data" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',d.get('toolName','unknown')))" \
        2>/dev/null || echo "unknown")
fi

# Duration from env takes precedence
if [ -n "${CLAUDE_TOOL_DURATION_MS:-}" ]; then
    duration_ms="$CLAUDE_TOOL_DURATION_MS"
fi

# ── Extract output ────────────────────────────────────────────────────────────
safe_output="{}"
if command -v jq &>/dev/null && [ -n "$stdin_data" ]; then
    safe_output=$(printf '%s' "$stdin_data" | jq -c '.output // .result // .response // .' 2>/dev/null || printf '{}')
elif [ -n "$stdin_data" ]; then
    safe_output="{}"
fi

# ── Build payload ─────────────────────────────────────────────────────────────
session_id="${CLAUDE_SESSION_ID:-unknown}"
timestamp_ms=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "0")

# JSON-encode string fields safely
if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_tool=$(printf '%s' "$tool_name"   | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
else
    j_session="\"${session_id}\""
    j_tool="\"${tool_name}\""
fi

internal_field=""
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then internal_field=",\"internal\":true"; fi

if [ -n "$duration_ms" ]; then
    payload="{\"type\":\"post_tool_use\",\"sessionId\":${j_session},\"toolName\":${j_tool},\"output\":${safe_output},\"durationMs\":${duration_ms},\"timestamp\":${timestamp_ms}${internal_field}}"
else
    payload="{\"type\":\"post_tool_use\",\"sessionId\":${j_session},\"toolName\":${j_tool},\"output\":${safe_output},\"timestamp\":${timestamp_ms}${internal_field}}"
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
