#!/usr/bin/env bash
# Ouroboros hook — fires when Claude Code loads an instruction/rule file.
#
# Reads the InstructionsLoaded event data from stdin (JSON), transforms
# it to the IDE wire format, and sends an instructions_loaded event to
# Ouroboros. Exits silently if Ouroboros is not running.

set -euo pipefail

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

# ── Read stdin ────────────────────────────────────────────────────────────────
stdin_data=""
if read -t "$TIMEOUT" -r line 2>/dev/null; then
    stdin_data="$line"
    while IFS= read -t 0.05 -r more 2>/dev/null; do
        stdin_data="${stdin_data}
${more}"
    done
fi

[ -z "$stdin_data" ] && exit 0

# ── Extract fields ───────────────────────────────────────────────────────────
session_id="${CLAUDE_SESSION_ID:-unknown}"
file_path=""
memory_type="Project"
load_reason="unknown"
globs_json="null"

if command -v jq &>/dev/null; then
    parsed_sid=$(printf '%s' "$stdin_data" | jq -r '.session_id // empty' 2>/dev/null || echo "")
    [ -n "$parsed_sid" ] && session_id="$parsed_sid"
    file_path=$(printf '%s' "$stdin_data" | jq -r '.file_path // empty' 2>/dev/null || echo "")
    memory_type=$(printf '%s' "$stdin_data" | jq -r '.memory_type // "Project"' 2>/dev/null || echo "Project")
    load_reason=$(printf '%s' "$stdin_data" | jq -r '.load_reason // "unknown"' 2>/dev/null || echo "unknown")
    globs_json=$(printf '%s' "$stdin_data" | jq -c '.globs // null' 2>/dev/null || echo "null")
elif command -v python3 &>/dev/null; then
    eval "$(printf '%s' "$stdin_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    sid = d.get('session_id') or ''
    fp = d.get('file_path') or ''
    mt = d.get('memory_type') or 'Project'
    lr = d.get('load_reason') or 'unknown'
    gl = json.dumps(d.get('globs')) if d.get('globs') else 'null'
    print(f'session_id={json.dumps(sid)}')
    print(f'file_path={json.dumps(fp)}')
    print(f'memory_type={json.dumps(mt)}')
    print(f'load_reason={json.dumps(lr)}')
    print(f'globs_json={gl}')
except Exception:
    pass
" 2>/dev/null || true)"
fi

[ -z "$file_path" ] && exit 0

# ── Build payload ─────────────────────────────────────────────────────────────
timestamp_ms=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "0")

if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_file_path=$(printf '%s' "$file_path" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_memory_type=$(printf '%s' "$memory_type" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_load_reason=$(printf '%s' "$load_reason" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
else
    j_session="\"${session_id}\""
    j_file_path="\"${file_path}\""
    j_memory_type="\"${memory_type}\""
    j_load_reason="\"${load_reason}\""
fi

input_obj="{\"file_path\":${j_file_path},\"memory_type\":${j_memory_type},\"load_reason\":${j_load_reason}"
if [ "$globs_json" != "null" ]; then
    input_obj="${input_obj},\"globs\":${globs_json}"
fi
input_obj="${input_obj}}"

payload="{\"type\":\"instructions_loaded\",\"sessionId\":${j_session},\"timestamp\":${timestamp_ms},\"input\":${input_obj}}"
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then
    payload="{\"type\":\"instructions_loaded\",\"sessionId\":${j_session},\"timestamp\":${timestamp_ms},\"input\":${input_obj},\"internal\":true}"
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
