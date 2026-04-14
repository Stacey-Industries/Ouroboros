#!/usr/bin/env bash
# Ouroboros hook — fires before Claude Code executes a tool.
#
# Reads tool call data from stdin (JSON), then sends a pre_tool_use
# event to Ouroboros with a unique requestId. If approval is required,
# polls for a response file before exiting.
# Exits silently if Ouroboros is not running.
#
# Requires: bash 4+, python3 or jq (for JSON), nc (netcat) or /dev/tcp

set -euo pipefail

SOCKET_PATH="${TMPDIR:-/tmp}/agent-ide-hooks.sock"
TCP_HOST="127.0.0.1"
TCP_PORT="${AGENT_IDE_HOOKS_PORT:-3333}"
TIMEOUT=1   # seconds — must be fast
APPROVALS_DIR="${HOME}/.ouroboros/approvals"

# Override from OUROBOROS_HOOKS_ADDRESS if Ouroboros injected it at PTY spawn
if [ -n "${OUROBOROS_HOOKS_ADDRESS:-}" ]; then
    case "$OUROBOROS_HOOKS_ADDRESS" in
        *:*) TCP_HOST="${OUROBOROS_HOOKS_ADDRESS%%:*}"; TCP_PORT="${OUROBOROS_HOOKS_ADDRESS##*:}" ;;
        *)   TCP_PORT="$OUROBOROS_HOOKS_ADDRESS" ;;
    esac
fi
POLL_INTERVAL=0.5  # seconds
MAX_POLL_SECONDS=15  # approve by default after this; avoids the old 2-minute stall

# Skip entirely for sessions not spawned by Ouroboros. This hook is installed
# globally in ~/.claude/settings.json so it fires for every Claude CLI session
# on this machine. Without a token the server will reject auth anyway, and the
# old code then polled 120s for an approval that could never arrive.
if [ -z "${OUROBOROS_HOOKS_TOKEN:-}" ]; then
    exit 0
fi

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

# ── Generate unique request ID ────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    request_id=$(python3 -c "import uuid; print(uuid.uuid4().hex[:16])")
elif [ -f /proc/sys/kernel/random/uuid ]; then
    request_id=$(cat /proc/sys/kernel/random/uuid | tr -d '-' | head -c 16)
else
    request_id="$(date +%s%N | md5sum 2>/dev/null | head -c 16 || echo "$(date +%s)$$")"
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

# JSON-encode strings
if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_tool=$(printf '%s' "$tool_name" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_reqid=$(printf '%s' "$request_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
else
    j_session="\"${session_id}\""
    j_tool="\"${tool_name}\""
    j_reqid="\"${request_id}\""
fi

payload="{\"type\":\"pre_tool_use\",\"sessionId\":${j_session},\"toolName\":${j_tool},\"input\":${safe_input},\"requestId\":${j_reqid},\"timestamp\":${timestamp_ms}}"
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then
    payload="{\"type\":\"pre_tool_use\",\"sessionId\":${j_session},\"toolName\":${j_tool},\"input\":${safe_input},\"requestId\":${j_reqid},\"timestamp\":${timestamp_ms},\"internal\":true}"
fi
auth_line='{"auth":"'"${OUROBOROS_HOOKS_TOKEN:-}"'"}'$'\n'
ndjson_line="${auth_line}${payload}"$'\n'

# ── Send helper ───────────────────────────────────────────────────────────────
sent=false

send_payload() {
    local data="$1"

    # 1. Try Unix domain socket via nc
    if [ -S "$SOCKET_PATH" ] && command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -U -w 1 "$SOCKET_PATH" 2>/dev/null && { sent=true; return 0; }
    fi

    # 2. Try TCP via nc
    if command -v nc &>/dev/null; then
        printf '%s' "$data" | nc -w 1 "$TCP_HOST" "$TCP_PORT" 2>/dev/null && { sent=true; return 0; }
    fi

    # 3. Try /dev/tcp bash built-in (no nc required)
    if (printf '%s' "$data" > /dev/tcp/"$TCP_HOST"/"$TCP_PORT") 2>/dev/null; then
        sent=true
        return 0
    fi

    # 4. Try curl as last resort
    if command -v curl &>/dev/null; then
        printf '%s' "$data" | curl -s --max-time 1 \
            --data-binary @- \
            "http://${TCP_HOST}:${TCP_PORT}/" 2>/dev/null && { sent=true; return 0; }
    fi

    return 0
}

send_payload "$ndjson_line" || true

# If we couldn't reach Ouroboros, approve by default
if [ "$sent" != "true" ]; then
    exit 0
fi

# ── Poll for approval response ────────────────────────────────────────────────
response_path="${APPROVALS_DIR}/${request_id}.response"
elapsed=0

while [ "$elapsed" -lt "$MAX_POLL_SECONDS" ]; do
    if [ -f "$response_path" ]; then
        response_text=$(cat "$response_path" 2>/dev/null || echo "")
        rm -f "$response_path" 2>/dev/null || true

        if [ -n "$response_text" ]; then
            decision=""
            reason=""

            if command -v jq &>/dev/null; then
                decision=$(printf '%s' "$response_text" | jq -r '.decision // "approve"' 2>/dev/null || echo "approve")
                reason=$(printf '%s' "$response_text" | jq -r '.reason // ""' 2>/dev/null || echo "")
            elif command -v python3 &>/dev/null; then
                decision=$(printf '%s' "$response_text" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('decision','approve'))" 2>/dev/null || echo "approve")
                reason=$(printf '%s' "$response_text" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reason',''))" 2>/dev/null || echo "")
            fi

            if [ "$decision" = "reject" ]; then
                if [ -n "$reason" ]; then
                    echo "$reason"
                else
                    echo "Rejected by user in Ouroboros IDE"
                fi
                exit 2
            fi

            # Approved
            exit 0
        fi
    fi

    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + 1))
done

# Timeout — approve by default
exit 0
