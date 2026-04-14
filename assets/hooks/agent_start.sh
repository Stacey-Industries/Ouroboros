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

# ── Extract subagent session ID, prompt, and model from stdin ────────────────
# CLAUDE_SESSION_ID env var = the PARENT session's ID.
# stdin JSON contains the SUBAGENT's data, including its own session_id.
task_label="Sub-agent"
subagent_session_id=""
model_id=""
raw_prompt=""

if [ -n "$stdin_data" ]; then
    if command -v jq &>/dev/null; then
        subagent_session_id=$(printf '%s' "$stdin_data" | \
            jq -r '.session_id // .sessionId // empty' 2>/dev/null || echo "")
        model_id=$(printf '%s' "$stdin_data" | \
            jq -r '.model_id // .model // empty' 2>/dev/null || echo "")
        raw_prompt=$(printf '%s' "$stdin_data" | \
            jq -r '.prompt // .message // .task // empty' 2>/dev/null || echo "")
        if [ -n "$raw_prompt" ]; then
            task_label=$(printf '%s' "$raw_prompt" | tr -s '[:space:]' ' ' | cut -c1-120)
        fi
    elif command -v python3 &>/dev/null; then
        eval "$(printf '%s' "$stdin_data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    sid = d.get('session_id') or d.get('sessionId') or ''
    mid = d.get('model_id') or d.get('model') or ''
    p = d.get('prompt') or d.get('message') or d.get('task') or ''
    label = ' '.join(p.split())[:120] if p else 'Sub-agent'
    # Shell-safe output
    print(f'subagent_session_id={json.dumps(sid)}')
    print(f'model_id={json.dumps(mid)}')
    print(f'raw_prompt={json.dumps(p)}')
    print(f'task_label={json.dumps(label)}')
except Exception:
    print('task_label=\"Sub-agent\"')
" 2>/dev/null || echo 'task_label="Sub-agent"')"
    fi
fi

# Use subagent's session_id from stdin; fall back to a generated ID if missing
if [ -n "$subagent_session_id" ]; then
    session_id="$subagent_session_id"
else
    session_id="subagent-$(date +%s%N 2>/dev/null | md5sum 2>/dev/null | head -c 12 || echo "$$")"
fi

# Parent = the session that spawned this subagent (from env var)
parent_session_id="${CLAUDE_SESSION_ID:-}"

# ── Build payload ─────────────────────────────────────────────────────────────
timestamp_ms=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "0")

if command -v python3 &>/dev/null; then
    j_session=$(printf '%s' "$session_id"  | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_label=$(printf '%s'   "$task_label"  | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    j_parent=""
    if [ -n "$parent_session_id" ]; then
        j_parent=$(printf '%s' "$parent_session_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    fi
    j_prompt=""
    if [ -n "$raw_prompt" ]; then
        j_prompt=$(printf '%s' "$raw_prompt" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    fi
    j_model=""
    if [ -n "$model_id" ]; then
        j_model=$(printf '%s' "$model_id" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
    fi
else
    j_session="\"${session_id}\""
    j_label="\"${task_label}\""
    j_parent=""
    if [ -n "$parent_session_id" ]; then j_parent="\"${parent_session_id}\""; fi
    j_prompt=""
    if [ -n "$raw_prompt" ]; then j_prompt="\"${raw_prompt}\""; fi
    j_model=""
    if [ -n "$model_id" ]; then j_model="\"${model_id}\""; fi
fi

# Build JSON with optional fields
payload="{\"type\":\"agent_start\",\"sessionId\":${j_session},\"taskLabel\":${j_label},\"timestamp\":${timestamp_ms}"
if [ -n "$j_parent" ]; then payload="${payload},\"parentSessionId\":${j_parent}"; fi
if [ -n "$j_prompt" ]; then payload="${payload},\"prompt\":${j_prompt}"; fi
if [ -n "$j_model" ]; then payload="${payload},\"model\":${j_model}"; fi
if [ "${OUROBOROS_INTERNAL:-}" = "1" ]; then payload="${payload},\"internal\":true"; fi
if [ "${OUROBOROS_IDE_SESSION:-}" = "1" ]; then payload="${payload},\"ideSpawned\":true"; fi
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
