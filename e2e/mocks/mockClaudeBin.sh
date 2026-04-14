#!/bin/bash
# mockClaudeBin.sh — deterministic stub for the `claude` CLI.
#
# Emits a fixed stream-json sequence matching the shape produced by:
#   claude -p --output-format stream-json
#
# The SESSION_ID echoed here is consumed by the IDE to correlate events.
# All output goes to stdout; the IDE reads it line-by-line.
#
# Messages emitted:
#   1. system   — init block with session_id
#   2. assistant — text + tool_use (Edit) so checkpoint/conflict tests have a
#                  file-mutating turn to inspect
#   3. result   — final stats block
#
# Usage: place this script on PATH (via globalSetup) before running tests.

SESSION_ID="${MOCK_SESSION_ID:-mock-session-$(date +%s)}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. system init
printf '{"type":"system","subtype":"init","session_id":"%s","tools":[],"mcp_servers":[]}\n' \
  "$SESSION_ID"

# 2. assistant message with text block + tool_use (Edit)
printf '{"type":"assistant","message":{"id":"msg_stub","type":"message","role":"assistant","content":[{"type":"text","text":"I will edit the file now."},{"type":"tool_use","id":"tu_stub_01","name":"Edit","input":{"path":"src/utils.ts","old_string":"clamp","new_string":"clampValue"}}],"model":"claude-stub","stop_reason":"tool_use","usage":{"input_tokens":10,"output_tokens":20}},"session_id":"%s"}\n' \
  "$SESSION_ID"

# 3. tool result (simulated)
printf '{"type":"tool_result","tool_use_id":"tu_stub_01","content":"OK","session_id":"%s"}\n' \
  "$SESSION_ID"

# 4. final result block
printf '{"type":"result","subtype":"success","cost_usd":0.0,"is_error":false,"num_turns":1,"result":"Done.","session_id":"%s","total_cost_usd":0.0,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}\n' \
  "$SESSION_ID"
