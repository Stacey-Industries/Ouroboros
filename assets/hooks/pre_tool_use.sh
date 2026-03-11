#!/usr/bin/env bash
# Ouroboros hook — fires before Claude Code executes a tool.
#
# Reads tool call data from stdin (JSON), then sends a pre_tool_use
# event to the Ouroboros via Unix domain socket or TCP fallback.
# Exits silently if the Ouroboros is not running.
#
# Requires: bash 4+, python3 or jq (for JSON), nc (netcat) or /dev/tcp

set -euo pipefail

SOCKET_PATH="${TMPDIR:-/tmp}/agent-ide-hooks.sock"
TCP_HOST="127.0.0.1"
TCP_PORT="${AGENT_IDE_HOOKS_PORT:-3333}"
TIMEOUT=1   # seconds — must be fast

# ── Read stdin ────────────────────────────────────────────────────────────────
stdin_data=""
if read -t "$TIMEOUT" -r line 2>/dev/null; then
    stdin_data="$line"
    # Drain remaining lines (tools can send multi-line JSON)
    while IFS= read -t 0.05 -r more 2>/dev/null; do
        stdin_data="${stdin_data}
${more}"
    done
fi

# ── Extract tool name ─────────────────────────────────────────────────────────
tool_name="unknown"
if command -v jq &>/dev/null && [ -n "$stdin_data" ]; then
    tool_name=$(printf '%s' "$stdin_data" | jq -r '.tool_name // .toolName // "unknown"' 2>/dev/null || echo "unknown")
elif command -v python3 &>/dev/null && [ -n "$stdin_data" ]; then
    tool_name=$(printf '%s' "$stdin_data" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',d.get('toolName','unknown')))" \
        2>/dev/null || echo "unknown")
fi

# ── Build payload ─────────────────────────────────────────────────────────────
session_id="${CLAUDE_SESSION_ID:-unknown}"
timestamp_ms=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "0")

# Safely escape the input for embedding in JSON
safe_input=""
if command -v jq &>/dev/null && [ -n "$stdin_data" ]; then
    safe_input=$(printf '%s' "$stdin_data" | jq -c '.' 2>/dev/null || printf '{}')
elif [ -n "$stdin_data" ]; then
    safe_input="{}"
else
    safe_input="{}"
fi

payload="{\"type\":\"pre_tool_use\",\"sessionId\":$(printf '%s' "$session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$session_id"),\"toolName\":$(printf '%s' "$tool_name" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$tool_name"),\"input\":${safe_input},\"timestamp\":${timestamp_ms}}"
ndjson_line="${payload}"$'\n'

# ── Send helper ───────────────────────────────────────────────────────────────
send_payload() {
    local data="$1"

    # 1. Try Unix domain socket via nc
    if [ -S "$SOCKET_PATH" ] && command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -U -w 1 "$SOCKET_PATH" 2>/dev/null && return 0
    fi

    # 2. Try TCP via nc
    if command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -w 1 "$TCP_HOST" "$TCP_PORT" 2>/dev/null && return 0
    fi

    # 3. Try /dev/tcp bash built-in (no nc required)
    if (printf '%s' "$data" > /dev/tcp/"$TCP_HOST"/"$TCP_PORT") 2>/dev/null; then
        return 0
    fi

    # 4. Try curl as last resort
    if command -v curl &>/dev/null; then
        printf '%s' "$data" | curl -s --max-time 1 \
            --data-binary @- \
            "http://${TCP_HOST}:${TCP_PORT}/" 2>/dev/null
    fi

    return 0  # Always exit 0 — don't block Claude Code
}

send_payload "$ndjson_line" || true
exit 0
