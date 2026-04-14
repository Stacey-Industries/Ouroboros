# mockClaudeBin.ps1 — deterministic stub for the `claude` CLI on Windows.
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
#   3. tool_result — simulated tool response
#   4. result   — final stats block
#
# Usage: globalSetup writes a wrapper .cmd that calls this script, then
# prepends its parent directory to PATH.

param()

$sessionId = if ($env:MOCK_SESSION_ID) { $env:MOCK_SESSION_ID } else { "mock-session-$([int][double]::Parse((Get-Date -UFormat '%s')))" }

# 1. system init
[Console]::WriteLine("{`"type`":`"system`",`"subtype`":`"init`",`"session_id`":`"$sessionId`",`"tools`":[],`"mcp_servers`":[]}")

# 2. assistant message with text + Edit tool_use
[Console]::WriteLine("{`"type`":`"assistant`",`"message`":{`"id`":`"msg_stub`",`"type`":`"message`",`"role`":`"assistant`",`"content`":[{`"type`":`"text`",`"text`":`"I will edit the file now.`"},{`"type`":`"tool_use`",`"id`":`"tu_stub_01`",`"name`":`"Edit`",`"input`":{`"path`":`"src/utils.ts`",`"old_string`":`"clamp`",`"new_string`":`"clampValue`"}}],`"model`":`"claude-stub`",`"stop_reason`":`"tool_use`",`"usage`":{`"input_tokens`":10,`"output_tokens`":20}},`"session_id`":`"$sessionId`"}")

# 3. tool result
[Console]::WriteLine("{`"type`":`"tool_result`",`"tool_use_id`":`"tu_stub_01`",`"content`":`"OK`",`"session_id`":`"$sessionId`"}")

# 4. final result
[Console]::WriteLine("{`"type`":`"result`",`"subtype`":`"success`",`"cost_usd`":0.0,`"is_error`":false,`"num_turns`":1,`"result`":`"Done.`",`"session_id`":`"$sessionId`",`"total_cost_usd`":0.0,`"usage`":{`"input_tokens`":10,`"output_tokens`":20,`"cache_read_input_tokens`":0,`"cache_creation_input_tokens`":0}}")
