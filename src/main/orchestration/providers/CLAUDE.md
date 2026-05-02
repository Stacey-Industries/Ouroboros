<!-- claude-md-auto:start -->
# Providers — AI Provider Adapter Implementations

Two provider adapters behind a common `ProviderAdapter` interface: **Claude Code CLI** (subprocess + stream-json) and **Codex** (exec runner with thread-based sessions). Each provider owns its own launch, context-building, event-handling, and process-management pipeline. OAuth credential management for Anthropic lives one level up at `src/main/auth/providers/anthropicAuth.ts`.

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

(Pre-multi-provider Claude-Code-only section was removed in 2026-05 — `claudeCodeAdapter` is no longer the sole adapter, and `anthropicAuth.ts` lives at `src/main/auth/providers/`. The auto-generated section above describes the current shape with both `claudeCodeAdapter` and `codexAdapter`.)
