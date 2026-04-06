<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
Three distinct provider strategies are visible in this directory: `ClaudeCodeAdapter` (CLI subprocess + NDJSON streaming), `AnthropicApiAdapter` (direct SDK, no tool use, no resume), and `CodexAdapter` (separate exec runner with thread-based resume). Each has its own launch/event/context pipeline — the file explosion (~24 files) is a direct consequence of the 300-line ESLint limit forcing decomposition.
`─────────────────────────────────────────────────`

# Providers — AI Provider Adapter Implementations

Three provider adapters behind a common `ProviderAdapter` interface: **Claude Code CLI** (subprocess + stream-json), **Anthropic API** (direct SDK streaming), and **Codex** (exec runner with thread-based sessions). Each provider owns its own launch, context-building, event-handling, and process-management pipeline.

## Key Files

| File | Role |
|---|---|
| `providerAdapter.ts` | Common interface — `ProviderAdapter`, `ProviderLaunchContext`, `ProviderResumeContext`, `ProviderProgressSink`, `StaticProviderAdapterRegistry`. All three providers implement this. |
| `streamJsonTypes.ts` | Types for Claude Code's `--output-format stream-json` NDJSON protocol: system/assistant/user/result events, content blocks (text, tool_use, thinking, tool_result), spawn options, process handle. |

### Claude Code CLI Provider (`claude-code`)
| File | Role |
|---|---|
| `claudeCodeAdapter.ts` | Thin `ProviderAdapter` class — delegates to `launchClaude()`, routes cancellation to PTY or headless paths |
| `claudeCodeLaunch.ts` | Launch orchestration — resolves settings, materializes attachments, registers placeholder handle, calls `launchHeadless()` or `launchPtyBacked()` |
| `claudeCodeState.ts` | Module-level shared state: `activeProcesses`, `cancelledTasks`, `activeAgentPtySessions`. Extracted to break circular imports between adapter and launch files |
| `claudeStreamJsonRunner.ts` | Process spawner — builds CLI args, spawns `claude` via `child_process`, parses NDJSON stdout line-by-line, resolves a `Promise<StreamJsonResultEvent>` |
| `claudeCodeEventHandler.ts` | Snapshot diffing — Claude Code sends full message snapshots; this file diffs them into per-block deltas with stable global indices across multi-turn sessions |
| `claudeCodeContextBuilder.ts` | Serializes `ContextPacket` into XML blocks (`<ide_context>`, `<relevant_code>`, etc.) appended to stdin prompt |
| `claudeCodeHelpers.ts` | Shared launch helpers: `launchHeadless`, `handleLaunchSuccess/Error`, `materializeAttachments`, `cliSessionExists` |
| `claudeCodeSubagentHandler.ts` | Detects `parent_tool_use_id` events — subagent responses routed as `subToolActivity` on the parent block |
| `anthropicAuth.ts` | OAuth credential management — reads `~/.claude/.credentials.json`, refreshes tokens 5 min before expiry, creates `Anthropic` SDK clients |

### Anthropic API Provider (`anthropic-api`)
| File | Role |
|---|---|
| `anthropicApiAdapter.ts` | Direct Anthropic SDK adapter — streams via `client.messages.stream`, no tool use, no resume support. Returns synchronously; stream runs in background `void` chain |

### Codex Provider (`codex`)
| File | Role |
|---|---|
| `codexAdapter.ts` | `ProviderAdapter` implementation — orchestrates prompt building, process spawning, event handling, and temp file cleanup |
| `codexExecRunner.ts` | Low-level Codex CLI spawner — `spawnCodexExecProcess()` with NDJSON event parsing |
| `codexExecRunnerHelpers.ts` | Codex event type definitions and NDJSON parsing helpers |
| `codexEventHandler.ts` | Maps Codex events to `ProviderProgressEvent` for the sink |
| `codexContextBuilder.ts` | Builds Codex prompt from `ContextPacket` (markdown format, not XML) |
| `codexLaunch.ts` | Codex-side deferred cancellation, session ref, placeholder handle — mirrors `claudeCodeState.ts` pattern |
| `codexAdapterHelpers.ts` | Settings resolution, capabilities factory, temp file cleanup |
| `codexThreadDiag.ts` | Thread ID verification helper — checks if a Codex thread ID is still valid before resuming |

### Tests
| File | Role |
|---|---|
| `claudeStreamJsonRunner.test.ts` | Unit tests for arg building + NDJSON parsing; mocks `child_process.spawn` |
| `codexExecRunner.test.ts` | Unit tests for Codex process spawning |
| `codexEventHandler.test.ts` | Codex event handler tests |
| `providerAdapter.test.ts` | Minimal adapter interface test scaffold |

## Key Patterns

**Deferred cancellation via placeholder handle**: Both Claude Code and Codex register a placeholder `ProcessHandle` in `activeProcesses` before the async launch sequence (attachment materialization, etc.) completes. `cancelTask()` can then kill during startup without a race condition.

**Snapshot diffing (Claude Code only)**: Claude Code's stream-json emits full message snapshots, not incremental deltas. `claudeCodeEventHandler.ts` maintains `localToGlobal` block index mapping and `emittedContentLengths` to compute per-character text deltas by slicing past what was already emitted.

**Turn boundary detection**: A `user` event in the stream signals a turn boundary (tool result returned). This is more reliable than comparing block type arrays because two consecutive `[tool_use]` turns would be indistinguishable by shape alone.

**Global block indices**: Block positions increment monotonically across multi-turn sessions so each block has a stable unique address. Subagent blocks (`parent_tool_use_id` present) are nested under the parent's global index, not given a top-level index.

**Context serialization diverges by provider**: Claude Code uses XML blocks in stdin (`<ide_context>`, `<relevant_code>`). Anthropic API uses Markdown sections in the system prompt. Codex uses its own `codexContextBuilder.ts` format.

**`claudeCodeState.ts` exists only to break circular imports**: `claudeCodeAdapter.ts` and `claudeCodeLaunch.ts` both need `activeProcesses` — extracting it avoids a circular dependency between the two.

## Gotchas

- **Windows process kill uses `taskkill /T /F`**: `child.kill()` only kills the immediate PowerShell wrapper. The runner uses `taskkill /T /F /PID` to kill the entire tree. Do not replace with `child.kill()`.
- **Windows CLI args go through PowerShell**: `claude` is invoked via `powershell.exe -Command` with single-quote escaping to prevent metacharacter injection. Don't simplify this to direct `spawn('claude', ...)`.
- **Anthropic API adapter returns before streaming completes**: `submitTask` resolves immediately; the stream runs in a detached `void` chain. The caller must not await completion — it reads events from the sink.
- **`effort: 'low'` is the only effort level that caps turns**: Only `low` adds `--max-turns 5`. All other effort values let Claude Code run to natural completion.
- **PTY-backed launch is bypassed**: `tryLaunchPtyBacked` exists in `claudeCodeHelpers.ts` but is not called — `-p` (print mode) is incompatible with TTY stdin on Windows. All launches go headless.
- **OAuth expiry buffer is 5 minutes**: `anthropicAuth.ts` refreshes tokens 5 min before expiry. Debugging mid-request auth failures should check if the session was near expiry when the request started.
- **100 MB stdout cap**: Both stdout and stderr are capped. Process is killed if stdout exceeds 100 MB. Check `claudeStreamJsonRunner.ts` if seeing silent truncations.
- **Codex thread ID is validated before resume**: `codexThreadDiag.ts` verifies thread existence via a lightweight exec check before resume is attempted. If the thread was garbage-collected server-side, resume falls back to a fresh launch.

## Dependencies

| Direction | Module | Why |
|---|---|---|
| Imports from | `../types` | `ContextPacket`, `ProviderCapabilities`, `ProviderProgressEvent`, `TaskRequest` |
| Imports from | `../../config` | `getConfigValue`, `ClaudeCliSettings`, `ClaudeCodexSettings` |
| Imports from | `../../pty`, `../../ptyAgentBridge` | PTY session management (currently bypassed for headless path) |
| Imports from | `../../providers` | `resolveModelEnv` for provider-routed model env vars |
| Imports from | `../../agentChat/types` | `ImageAttachment` |
| Consumed by | `../chatOrchestrationBridge` | Creates adapters and registers them in `StaticProviderAdapterRegistry` |
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# Providers — Claude Code CLI integration layer

Adapts the Claude Code CLI (`claude -p --output-format stream-json`) into the orchestration provider interface. Handles process lifecycle, NDJSON streaming, context injection, and OAuth credential management.

## Key Files

| File                             | Role                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `providerAdapter.ts`             | Provider interface contract — `ProviderAdapter`, launch/resume/cancel contexts, `ProviderProgressSink` for streaming events upstream. All providers implement this.                                                            |
| `claudeCodeAdapter.ts`           | The sole `ProviderAdapter` implementation. Builds XML context blocks from `ContextPacket`, manages headless Claude Code processes, diffs stream-json snapshots into per-block deltas, handles image attachments as temp files. |
| `claudeStreamJsonRunner.ts`      | Low-level process spawner — builds CLI args, spawns `claude` via `child_process.spawn`, parses NDJSON stdout line-by-line, resolves a `Promise<StreamJsonResultEvent>`.                                                        |
| `streamJsonTypes.ts`             | TypeScript types for Claude Code's `--output-format stream-json` NDJSON protocol: system/assistant/result events, content blocks (text, tool_use, thinking, tool_result), spawn options.                                       |
| `anthropicAuth.ts`               | OAuth credential management — reads `~/.claude/.credentials.json`, auto-refreshes expired tokens, creates `Anthropic` SDK clients (API key or OAuth).                                                                          |
| `providerAdapter.test.ts`        | Minimal test scaffold for the adapter interface.                                                                                                                                                                               |
| `claudeStreamJsonRunner.test.ts` | Unit tests for arg building and NDJSON parsing — mocks `child_process.spawn`.                                                                                                                                                  |

## Architecture

```
chatOrchestrationBridge → ClaudeCodeAdapter.submitTask()
                            ├─ buildInitialPrompt() — conversation history + goal + XML context
                            ├─ materializeAttachments() — base64 → temp files
                            ├─ launchHeadless() → spawnStreamJsonProcess()
                            │    └─ spawn('claude', ['-p', '--output-format', 'stream-json'])
                            │         └─ prompt piped via stdin (avoids shell escaping)
                            └─ buildEventHandler() — diffs snapshots → per-block deltas → sink.emit()
```

## Key Patterns

- **Snapshot diffing**: Claude Code emits full message snapshots per event, not per-block deltas. `buildEventHandler` maintains `localToGlobal` index mapping and `emittedContentLengths` to compute text/thinking deltas by slicing new content past what was already emitted.
- **Global block indices**: Block indices increment across multi-turn conversations so each block (text, thinking, tool_use) has a unique position throughout the session. Turn boundaries are detected by comparing block type arrays.
- **Prompt via stdin**: The prompt is written to `child.stdin` (not as a CLI arg) to avoid shell-escaping issues and Windows command-line length limits.
- **Deferred cancellation**: A placeholder `StreamJsonProcessHandle` is registered in `activeProcesses` immediately, before async attachment materialization completes. This ensures `cancelTask` works even during the startup window.
- **XML context injection**: `ContextPacket` data is serialized into XML blocks (`<ide_context>`, `<current_focus>`, `<workspace_state>`, `<relevant_code>`, etc.) appended after the user's goal in the prompt.

## Gotchas

- **Windows process kill**: `child.kill()` only kills the immediate PowerShell wrapper. `taskkill /T /F /PID` is used to kill the entire process tree. See `claudeStreamJsonRunner.ts:136-152`.
- **Windows CLI args**: On Windows, `claude` is invoked via `powershell.exe -Command` with single-quote escaping to prevent PowerShell metacharacter injection. Don't simplify this.
- **100 MB buffer cap**: Both stdout and stderr buffers are capped at 100 MB to prevent OOM from runaway processes. The process is killed if stdout exceeds the limit.
- **`effort: 'low'` caps turns**: Only `low` effort adds `--max-turns 5`. All other effort levels let the model decide when to stop, matching Claude Code CLI behavior.
- **PTY path disabled**: PTY-backed launches (`tryLaunchPtyBacked`) exist but are currently bypassed — `-p` (print mode) is incompatible with TTY stdin on Windows. The headless `child_process` path is always used.
- **OAuth expiry buffer**: Token refresh triggers 5 minutes before actual expiry to avoid mid-request failures.

## Dependencies

| Direction    | Module                           | Why                                                              |
| ------------ | -------------------------------- | ---------------------------------------------------------------- |
| Imports from | `../types`                       | `ContextPacket`, `ProviderCapabilities`, `ProviderProgressEvent` |
| Imports from | `../../config`                   | `getConfigValue`, `ClaudeCliSettings`                            |
| Imports from | `../../pty`                      | `spawnAgentPty`, `killPty` (for PTY path, currently unused)      |
| Imports from | `../../agentChat/types`          | `ImageAttachment`                                                |
| Imports from | `../contextPacketBuilderSupport` | `getModelBudgets` (token budget per model)                       |
| Consumed by  | `../chatOrchestrationBridge`     | Creates and uses `ClaudeCodeAdapter`                             |
