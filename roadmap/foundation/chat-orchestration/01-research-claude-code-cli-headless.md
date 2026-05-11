---
status: COMPLETE
created: 2026-05-11
updated: 2026-05-11
role: Claude Code CLI subscription/headless capabilities research
produced-by: haiku-research-extractor
---

# Claude Code CLI — Headless / Subscription-Auth Capabilities

**Scope**: Ouroboros IDE uses `spawnClaude` to launch the `claude` CLI binary with stream-json output, NOT the Anthropic Agent SDK or direct API. Reason: user has Claude Max subscription, no API key. This document maps what the CLI provides vs what would only be available via SDK/API.

Every claim tagged: **VERIFIED** (cited from official docs), **INFERRED** (from CLI behavior or cross-references), **UNKNOWN** (couldn't confirm — flagged for own-verification).

---

## 1. `--resume <session-id>` Semantics

### What State Is Preserved

**VERIFIED** — [code.claude.com/docs/en/headless](https://code.claude.com/docs/en/headless)

- **Tool call history**: All prior tool calls and results retained and accessible to the model.
- **Conversation memory**: Entire message history (user prompts, assistant responses, tool results) preserved.
- **Thinking blocks**: Preserved when explicitly enabled (`max_thinking_tokens` in SDK or equivalent CLI flag). **Default: disabled**.
- **System prompts**: Reapplied on `--resume`.
- **Session metadata**: `session_id`, cost tracking, usage statistics, turn counts tracked continuously.

### Storage Location

**VERIFIED + INFERRED** — Sessions are persisted as JSONL files in `~/.claude/projects/` with hash-encoded subdirectories per project's absolute path. State is written to disk immediately as each message is generated (crash-resistant format). Sessions survive app restarts.

### Session ID Format

**INFERRED** — Format is not explicitly constrained to UUID in the docs. Observable behavior suggests UUID-like strings. Session ID is present on `SystemMessage` (subtype `"init"`), result messages, and raw stream events. [code.claude.com/docs/en/agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions)

### Session ID Stability

**VERIFIED** — Same `session_id` returned on every `--resume` call for that session; NOT regenerated per invocation. Documented pattern:

```bash
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"
```

### Known Limitation

**VERIFIED** — If the project absolute path changes (e.g., directory moved), the session becomes inaccessible because the hash directory key changes. Per WebSearch cross-reference.

---

## 2. Stream-JSON Output Format

### Event Type Catalog

**VERIFIED** — [code.claude.com/docs/en/headless](https://code.claude.com/docs/en/headless), [code.claude.com/docs/en/agent-sdk/streaming-output](https://code.claude.com/docs/en/agent-sdk/streaming-output)

#### `system` event (subtype `init`)
Session start; contains model, tools, MCP servers, loaded plugins:
```json
{
  "type": "system",
  "subtype": "init",
  "uuid": "<string>",
  "session_id": "<string>",
  "plugins": [{"name": "<string>", "path": "<string>"}],
  "plugin_errors": [...]
}
```

#### `system` event (subtype `api_retry`)
```json
{
  "type": "system",
  "subtype": "api_retry",
  "uuid": "<string>",
  "session_id": "<string>",
  "attempt": 1,
  "max_retries": 3,
  "retry_delay_ms": 1000,
  "error_status": 429,
  "error": "rate_limit"
}
```

#### `stream_event` (raw API events, requires `--include-partial-messages`)
```json
{
  "type": "stream_event",
  "uuid": "<string>",
  "session_id": "<string>",
  "parent_tool_use_id": "<string|null>",
  "event": { "type": "message_start | content_block_start | content_block_delta | content_block_stop | message_delta | message_stop", ... }
}
```

Inner `event.type` values:
| Type | Purpose |
|---|---|
| `message_start` | Start of a new message |
| `content_block_start` | Start of text or tool_use block |
| `content_block_delta` | Incremental update (`text_delta` or `input_json_delta`) |
| `content_block_stop` | End of content block |
| `message_delta` | Message-level updates (stop reason, usage) |
| `message_stop` | End of message |

#### `result` event (turn completion)
```json
{
  "type": "result",
  "subtype": "success | error_max_turns | error_during_execution | error_max_budget_usd | error_max_structured_output_retries",
  "uuid": "<string>",
  "session_id": "<string>",
  "duration_ms": 5000,
  "duration_api_ms": 4500,
  "is_error": false,
  "num_turns": 3,
  "result": "<string>",
  "stop_reason": "<string|null>",
  "total_cost_usd": 0.15,
  "usage": { "input_tokens": 1234, "output_tokens": 456, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0 },
  "modelUsage": { "<model>": { "inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens", "webSearchRequests", "costUSD", "contextWindow", "maxOutputTokens" } }
}
```

[code.claude.com/docs/en/agent-sdk/typescript](https://code.claude.com/docs/en/agent-sdk/typescript) provides the full TypeScript types for `SDKResultMessage`.

### What's NOT Emitted as Distinct Events

**INFERRED** — No explicit `user`, `user_message`, or `tool_result` event subtypes in stream-json output. Tool results are sent to the model internally; they are not exposed as separate stdout events. User messages don't appear as stream events either; only assistant deltas and lifecycle markers.

---

## 3. Hook System

### Hook Event Catalog

**VERIFIED** — [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)

| Hook Event | Fires When | Input | Output |
|---|---|---|---|
| `SessionStart` | Session init or `--resume` | matcher: `"startup"` or `"resume"` | Context injected into session |
| `Setup` | Session begins (equivalent to SessionStart in some SDKs) | settings.json hook config | Script runs |
| `PreToolUse` | Before a tool executes | `tool_name`, `tool_input`, `hook_event_name`, `tool_use_id` | `permissionDecision` ("allow"/"deny"/"ask"/"defer"), `additionalContext` |
| `PostToolUse` | After successful tool completion | tool name, input, output | `updatedToolOutput`, `additionalContext` |
| `PostToolUseFailure` | After tool failure | error, tool, input, `is_interrupt` | `additionalContext` |
| `UserPromptSubmit` | User sends a prompt | prompt text | `additionalContext` (appended to model) |
| `Notification` | Custom notifications | hook-specified | hook-specified |
| `PermissionRequest` | Tool needs approval (SDK mode) | permission type, resource | `decision` (allow/deny) |

[code.claude.com/docs/en/agent-sdk/claude-code-features](https://code.claude.com/docs/en/agent-sdk/claude-code-features) documents `PreToolUse` with `additionalContext` support.

### Environment Variables in Hooks

**VERIFIED** — [code.claude.com/docs/en/hooks-guide](https://code.claude.com/docs/en/hooks-guide)

- `$CLAUDE_PROJECT_DIR` — session working directory
- `$CLAUDE_SESSION_ID` — current session ID (supports variable substitution in hook commands)
- `$CLAUDE_ENV_FILE` — available in `SessionStart`, `Setup`, `CwdChanged`, `FileChanged`; scripts can write exports to persist env across the session

### Timing

**VERIFIED**:
- `SessionStart` fires BEFORE first prompt processed.
- `PreToolUse` fires BEFORE tool execution; can block.
- `PostToolUse` fires AFTER completion.
- **No synchronization across IPC/stream-json streams** — hooks affect future turns via `additionalContext`, not retroactively.

### Hook → stream-json Ordering

**UNKNOWN** — Documentation doesn't explicitly state ordering guarantees between hook event firings (on named pipe) and stream-json events (on stdout). For Ouroboros: the two channels are independent and must be reconciled with explicit ordering logic, not assumed.

---

## 4. What's NOT Available in Headless-CLI vs Agent SDK / Direct API

| Feature | CLI Status | Notes |
|---|---|---|
| Token counting (`countTokens`) | **UNKNOWN — no `--count-tokens` flag** | `usage` stats available post-hoc in `result` event; no pre-flight count. Direct API has `POST /v1/messages/count_tokens`, not exposed via CLI. |
| Prompt caching fine-grained control | **PARTIAL** | `ENABLE_PROMPT_CACHING_1H` env var switches TTL from 5min to 1h. Cross-session sharing via `excludeDynamicSections: true` in system prompt config. Manual cache-key management NOT exposed in CLI; SDK-only. |
| System prompt access mid-session | **NO** | Set ONCE at startup via `--system-prompt`, `--append-system-prompt`, `--append-system-prompt-file`. Cannot retrieve or rewrite mid-session. |
| Message history retrieval | **NO public API** | Sessions stored as JSONL on disk (`~/.claude/projects/`) but no CLI command to query without resuming. SDK has custom session store backends; CLI does not. |
| Structured multi-turn input (pre-built message arrays) | **NO** | CLI `-p` takes single prompt string. SDK supports passing arrays; CLI does not. |
| Streaming pause/resume mid-stream | **NO** | Once invoked, process streams until completion or error. Client can slow-read; cannot tell Claude Code to pause generation. |
| Runtime tool injection | **NO** | Tools defined before session via `.mcp.json`, `.claude/skills/`, or `--mcp-config`. No mid-conversation tool definition. SDK supports via `mcpServers` + `allowedTools` per query. |

---

## 5. Session Identity Stability

### `--resume` Session ID

**VERIFIED** — Same ID returned across all invocations using `--resume <id>`. Canonical identifier.

### Stream-JSON `session_id` Field

**INFERRED** — Appears identical to the user-visible session ID returned by `--output-format json`. Docs do not distinguish an internal UUID from a user-facing one. **Recommendation for Ouroboros**: treat them as identical until observation proves otherwise.

### Hook-Pipe `sessionId` vs Stream-JSON `session_id`

**INFERRED** — Both originate from the Claude Code process. Documentation treats them as the same identifier under different surface names. Empirical observation in Ouroboros's `[trace:agent-record]` chain shows they CAN diverge in timing (one arrives before the other) but the values themselves should match. **Verify against the codebase trace data — this is a known investigation point.**

### Mapping Session ID to On-Disk State

**INFERRED** — `~/.claude/projects/<hash-of-absolute-project-path>/<session-id>.jsonl`. Exact hash algorithm not documented. Known limitation: changing the project path makes the session inaccessible.

---

## 6. Authentication: Subscription OAuth vs API Key

### Subscription OAuth (Ouroboros's mode)

**VERIFIED** — [code.claude.com/docs/en/authentication](https://code.claude.com/docs/en/authentication)

**Precedence** (evaluation order):
1. Cloud provider credentials (Bedrock, Vertex, Foundry) if `CLAUDE_CODE_USE_*` env vars set
2. `ANTHROPIC_AUTH_TOKEN` (bearer token, proxies)
3. `ANTHROPIC_API_KEY` (direct API; requires approval in interactive mode)
4. `apiKeyHelper` script output (rotating credentials)
5. `CLAUDE_CODE_OAUTH_TOKEN` (long-lived OAuth, from `claude setup-token`)
6. **Subscription OAuth** (default for Pro/Max/Team/Enterprise after `/login`)

### Credential Storage by Platform

- **macOS**: encrypted Keychain
- **Linux**: `~/.claude/.credentials.json` (mode 0600)
- **Windows**: `%USERPROFILE%\.claude\.credentials.json` (inherits user ACL)

CLI auto-refreshes subscription credentials.

### Bare Mode

**VERIFIED** — `--bare` skips Keychain/credential reads. For bare-mode subscription auth: use `CLAUDE_CODE_OAUTH_TOKEN` (one-year validity, requires paid tier). For Ouroboros without `--bare`: cached credentials from prior interactive login are auto-available.

---

## 7. Summary Table

| Capability | Available in Headless CLI |
|---|---|
| Session resumption with full context | ✓ VERIFIED |
| Stream-json output with API events | ✓ VERIFIED (6+ event types) |
| Hook system | ✓ VERIFIED (8 event types) |
| Env var substitution in hooks | ✓ VERIFIED |
| Token usage stats (post-hoc) | ✓ VERIFIED |
| Prompt caching | ✓ PARTIAL (env var only) |
| One-time system prompt customization | ✓ VERIFIED |
| Mid-session system prompt access | ✗ |
| Message history retrieval API | ✗ |
| Structured multi-turn input | ✗ |
| Streaming pause/resume control | ✗ |
| Runtime tool injection | ✗ |
| Pre-flight token counting | ✗ (UNKNOWN — likely unavailable) |
| Subscription OAuth (no API key) | ✓ VERIFIED |

---

## 8. Sources

- [code.claude.com/docs/en/headless](https://code.claude.com/docs/en/headless) — running Claude Code programmatically
- [code.claude.com/docs/en/cli-reference](https://code.claude.com/docs/en/cli-reference) — complete CLI flag reference
- [code.claude.com/docs/en/agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions) — session resumption with session IDs
- [code.claude.com/docs/en/agent-sdk/streaming-output](https://code.claude.com/docs/en/agent-sdk/streaming-output) — stream event types
- [code.claude.com/docs/en/hooks-guide](https://code.claude.com/docs/en/hooks-guide) — hook lifecycle and env vars
- [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — hook configuration in settings.json
- [code.claude.com/docs/en/authentication](https://code.claude.com/docs/en/authentication) — auth methods, subscription OAuth, API keys
- [code.claude.com/docs/en/agent-sdk/typescript](https://code.claude.com/docs/en/agent-sdk/typescript) — SDKMessage and SDKResultMessage types
- [code.claude.com/docs/en/agent-sdk/modifying-system-prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts) — system prompt customization and caching
- [code.claude.com/docs/en/azure-ai-foundry](https://code.claude.com/docs/en/azure-ai-foundry) — `ENABLE_PROMPT_CACHING_1H` env var
- WebSearch cross-references: session storage location and JSONL format

---

## 9. Gaps for Own-Verification

1. **Session ID format** — confirm UUID vs other shape empirically.
2. **Message history API** — verify no undocumented programmatic query path.
3. **Token counting in CLI** — confirm `countTokens` is genuinely unavailable.
4. **Tool definition mid-session** — test MCP hot-load behavior.
5. **Stream-JSON `session_id` vs hook-pipe `sessionId`** — empirically confirm identical values (timing differences may be the only divergence).
6. **Hook event ordering vs stream-json events** — define explicit reconciliation policy; do not assume ordering.
