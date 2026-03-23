# IPC Handlers — Domain-split `ipcMain.handle()` registrars

All Electron IPC handler registration lives here. Each file is a domain registrar that binds `ipcMain.handle()` calls and returns a list of registered channel names. Imported and orchestrated by `../ipc.ts`.

## Key Files

| File                  | Role                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`            | Barrel — re-exports every `register*Handlers` function + cleanup helpers                                                                                        |
| `pathSecurity.ts`     | **Shared sandbox guard** — `assertPathAllowed()` validates paths against workspace roots. Imported by files, git, context, app, LSP, and symbol search handlers |
| `files.ts`            | File system ops — read/write/rename/delete, chokidar watchers, file dialog                                                                                      |
| `git.ts`              | Git ops — status, diff, log, commit, branch, stash (shells out to `git` CLI)                                                                                    |
| `config.ts`           | Config CRUD — get/set/watch electron-store values, import/export settings JSON, external settings file watcher                                                  |
| `agentChat.ts`        | Agent chat — thread CRUD, message sending, orchestration bridge. Lightweight facade over Claude Code adapter (not the removed AgentLoopController)              |
| `pty.ts`              | PTY — spawn, write, resize, kill, recording. Thin IPC shim over `../pty`                                                                                        |
| `app.ts`              | App-level handlers — version info, app paths, window open/reveal, external URL launch                                                                           |
| `sessions.ts`         | Session persistence — save/load/export/prune session JSON files in `userData/sessions/`                                                                         |
| `extensionStore.ts`   | VSX extension store — Open VSX Registry fetch, VSIX download/extract, theme loading                                                                             |
| `mcpStore.ts`         | MCP server store — `registry.modelcontextprotocol.io` fetch, install to Claude Code settings                                                                    |
| `mcp.ts`              | MCP runtime — server lifecycle, tool invocation                                                                                                                 |
| `miscRegistrars.ts`   | Catch-all sub-registrars — updater, cost, usage, crash logs, perf, LSP, shell history, symbols, windows, extensions, approval, graph                            |
| `misc.ts`             | Aggregator — calls all `miscRegistrars` sub-registrars, exports `lspStopAll`                                                                                    |
| `context.ts`          | IPC registration only — delegates project context scan + CLAUDE.md generation to scanner/generator files                                                        |
| `contextScanner.ts`   | Filesystem scanner — detects language, framework, package manager, entry points                                                                                 |
| `contextGenerator.ts` | Markdown generator — produces CLAUDE.md content from `ProjectContext`                                                                                           |
| `contextDetectors.ts` | Detection heuristics — framework/language/test-runner/build-tool classifiers                                                                                    |
| `contextTypes.ts`     | Shared types — `ProjectContext`, `ContextGenerateOptions`                                                                                                       |
| `claudeMd.ts`         | CLAUDE.md generation service — whole-project and per-directory via `../claudeMdGenerator`                                                                       |
| `gitDiffParser.ts`    | Unified diff parser — file-level change summaries from `git diff` output                                                                                        |
| `miscSymbolSearch.ts` | Cross-file symbol search + shell history reading                                                                                                                |
| `ideTools.ts`         | IDE tool server reverse channel — renderer responds to tool server queries                                                                                      |

## Registration Pattern

Every registrar follows the same contract:

```ts
export function registerXxxHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = [];
  ipcMain.handle('domain:action', handler);
  channels.push('domain:action');
  return channels;
}
```

- **Returns `string[]`** of registered channel names — used by `ipc.ts` for deduplication/logging.
- **`senderWindow`** resolves `IpcMainInvokeEvent` → `BrowserWindow` for sending events back to the renderer.
- Some registrars also export a `cleanup*` function (watchers, subscriptions).

## Response Convention

All handlers return `{ success: true, ...data }` or `{ success: false, error: string }`. Each file defines local type aliases (`HandlerSuccess<T>`, `HandlerFailure`) — don't import them across files.

## Path Security

Any handler accepting a user-supplied file path **must** call `assertPathAllowed(event, path)` before touching the filesystem. Returns `{ success: false, error }` if rejected, or `null` if allowed. Validates against per-window project root + multi-root workspace entries + default project root. Windows paths compared case-insensitively.

## Gotchas

- **`misc.ts` vs `miscRegistrars.ts`**: `misc.ts` is the thin aggregator. Add new catch-all handlers as sub-registrar functions in `miscRegistrars.ts`, not directly in `misc.ts`.
- **Web client broadcasts**: Handlers pushing events to the renderer (watchers, config changes, agent chat events) must also call `broadcastToWebClients()` from `../web/webServer` for web-mode parity.
- **No AgentLoopController**: The full controller was removed as dead code. `agentChat.ts` uses a minimal facade delegating directly to the Claude Code adapter. Don't re-introduce it.
- **Channel naming**: `domain:action` format throughout (e.g. `files:readFile`, `git:status`, `config:get`). PTY data channels embed session ID: `pty:data:${id}`.
- **ESLint limits**: 40 lines/function, complexity 10. Large registrars (extensionStore, miscRegistrars) extract helper functions to stay compliant.

## Dependencies

| Uses                           | For                                                             |
| ------------------------------ | --------------------------------------------------------------- |
| `../config`                    | `getConfigValue`, `setConfigValue`, `store`                     |
| `../pty`                       | PTY spawn/write/resize/kill                                     |
| `../web/webServer`             | `broadcastToWebClients` for web-mode event parity               |
| `../windowManager`             | `getWindow` for per-window project roots (used by pathSecurity) |
| `../agentChat/`                | Chat service, thread store, orchestration bridge                |
| `../orchestration/`            | Claude Code adapter, context packets, graph summaries           |
| `../lsp/`                      | LSP lifecycle (start/stop/hover/completion/diagnostics)         |
| `../contextLayer/`             | Context layer controller                                        |
| `../codebaseGraph/`            | Graph controller                                                |
| `../contributions/themeLoader` | Extension theme loading (extensionStore)                        |
