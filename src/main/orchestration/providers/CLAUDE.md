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
