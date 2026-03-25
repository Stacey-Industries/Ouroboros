<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
Two distinct registration signatures co-exist: primary domain registrars return `string[]` (own channel list), while sub-registrars in `miscRegistrars.ts` receive a `ChannelList` parameter and push to it. This split lets `misc.ts` aggregate multiple catch-all domains into a single returned channel list without every sub-domain needing its own top-level export in `index.ts`.
`─────────────────────────────────────────────────`

Now I have a precise picture of this directory. Here is the generated CLAUDE.md:

---

# src/main/ipc-handlers/ — Domain-split `ipcMain.handle()` registrars

All Electron IPC handler registration lives here. Each file is a domain registrar. Imported and orchestrated by `../ipc.ts`.

## Key Files

| File | Role |
|---|---|
| `index.ts` | Barrel — re-exports every `register*Handlers` + cleanup helpers consumed by `../ipc.ts` |
| `pathSecurity.ts` | **Shared sandbox guard** — `assertPathAllowed()` validates paths against workspace roots. Imported by files, git, context, LSP, and symbol search handlers |
| `files.ts` | Filesystem ops — read/write/rename/delete/move, chokidar watchers, file dialogs, image/binary loading |
| `filesHelpers.ts` | Pure helpers for `files.ts` — directory listing, soft-delete, binary loading, error formatting |
| `git.ts` | Git ops — status, diff, log, commit, branch, stash, snapshot, blame (shells out to `git` CLI) |
| `gitOperations.ts` | Git operation helpers — stage/unstage, checkout, revert, exec wrapper |
| `gitOperationsExtended.ts` | Extended git ops — changed files between refs, diff review, raw diff |
| `gitDiffParser.ts` | Unified diff parser — file-level change summaries from `git diff` output |
| `gitParsers.ts` | Parsers for `git log`, `git status`, `git blame` output |
| `gitBlameSnapshot.ts` | Blame snapshot capture and caching |
| `gitPatch.ts` | Patch application helpers |
| `config.ts` | Config CRUD — get/set/watch electron-store values, import/export settings JSON |
| `agentChat.ts` | Agent chat facade — thread CRUD, message sending, orchestration bridge, context cache control. Re-exports context cache helpers for other modules |
| `agentChatContext.ts` | Context cache — snapshot warm/invalidate/load; worker lifecycle for background refresh |
| `agentChatOrchestration.ts` | Minimal orchestration — `createMinimalOrchestration()` factory; delegates to Claude Code / Codex adapters. The removed AgentLoopController is **not** here |
| `sessions.ts` | Session persistence — save/load/export/prune session JSON in `userData/sessions/` (capped at 100 files) |
| `auth.ts` | Authentication — OAuth token storage, provider login/logout, token refresh |
| `pty.ts` | PTY — spawn, write, resize, kill, recording. Thin IPC shim over `../pty` |
| `app.ts` | App-level — version info, app paths, window management, external URL launch |
| `mcp.ts` | MCP runtime — server lifecycle, tool invocation |
| `mcpStore.ts` | MCP server store — `registry.modelcontextprotocol.io` fetch, install to Claude Code settings |
| `mcpStoreSupport.ts` | Helpers for MCP store search and manifest parsing |
| `extensionStore.ts` | Top-level registrar — delegates to `extensionStoreApi.ts` and `extensionStoreMarketplace.ts` |
| `extensionStoreApi.ts` | Open VSX Registry fetch, VSIX install/extract, theme loading |
| `extensionStoreMarketplace.ts` | VS Code Marketplace search, detail fetch, download/install |
| `extensionStoreHelpers.ts` | Shared helpers — install from buffer, disabled list, broadcast utilities |
| `context.ts` | IPC registration only — delegates to scanner/generator files |
| `contextScanner.ts` | Filesystem scanner — detects language, framework, package manager, entry points |
| `contextGenerator.ts` | Markdown generator — produces CLAUDE.md content from `ProjectContext` |
| `contextDetectors.ts` | Detection heuristics — framework/language/test-runner/build-tool classifiers |
| `contextDetectorsHelpers.ts` | Helper functions for detector heuristics |
| `contextTypes.ts` | Shared types — `ProjectContext`, `ContextGenerateOptions` |
| `claudeMd.ts` | CLAUDE.md generation service — whole-project and per-directory via `../claudeMdGenerator` |
| `graphHandlers.ts` | Codebase graph IPC — query, search, architecture, call-path tracing |
| `lspHandlers.ts` | LSP IPC — hover, completion, diagnostics, go-to-definition |
| `miscSymbolSearch.ts` | Cross-file symbol search (regex-based) + shell history reading |
| `miscRegistrars.ts` | Sub-registrar collection — updater, cost, usage, crash logs, perf, shell history, symbols, approval. **TODO**: each domain should eventually become its own named file |
| `miscRegistrarsHelpers.ts` | Window and extension handler sub-registrars |
| `misc.ts` | Thin aggregator — calls all `miscRegistrars` sub-registrars; exports `lspStopAll` |
| `ideTools.ts` | IDE tool server reverse channel — renderer responds to tool server queries |
| `pathSecurity.test.ts` | Unit tests for path sandbox validation |
| `gitDiffParser.test.ts` | Unit tests for the unified diff parser (inline fixtures, no filesystem) |

## Registration Patterns

Two co-existing signatures:

**Primary domain registrars** (top-level exports in `index.ts`):
```ts
export function registerXxxHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = [];
  ipcMain.handle('domain:action', handler);
  channels.push('domain:action');
  return channels;
}
```

**Sub-registrars** (called from `misc.ts` via `miscRegistrars.ts`):
```ts
export function registerXxxHandlers(channels: ChannelList): void {
  registerChannel(channels, 'domain:action', handler);
}
```

The difference: primary registrars own their channel list; sub-registrars receive one from their aggregator (`misc.ts`). Only primary registrars appear in `index.ts`.

Some registrars take `win: BrowserWindow` directly (e.g. `auth.ts`, `agentChat.ts`) when they need to push events to a specific window rather than resolving it per-event.

## Response Convention

All handlers return `{ success: true, ...data }` or `{ success: false, error: string }`. Each file defines its own local `ok()` / `fail()` helpers and type aliases (`HandlerSuccess<T>`, `HandlerFailure`) — do not import these across files.

## Path Security

Any handler accepting a user-supplied filesystem path **must** call `assertPathAllowed(event, path)` before touching the filesystem:

```ts
const denied = assertPathAllowed(event, targetPath);
if (denied) return denied;
```

- Validates against: per-window project root (from `windowManager`) + configured multi-roots + default project root
- Windows paths compared case-insensitively
- Denies if no workspace root is configured
- ESLint rule `security/detect-non-literal-fs-filename` fires on paths derived from trusted constants (app dirs, `readdir` entries) — suppress with an explanatory comment, not by disabling the rule globally

## Gotchas

- **`misc.ts` vs `miscRegistrars.ts`**: `misc.ts` is the thin aggregator; `miscRegistrars.ts` holds the actual sub-registrar functions. New catch-all handlers go in `miscRegistrars.ts` as a new `register*Handlers(channels)` function.
- **Web client parity**: Handlers that push events to the renderer (watchers, config changes, agent chat events) must also call `broadcastToWebClients()` from `../web/webServer`.
- **No AgentLoopController**: Was removed as dead code. `agentChatOrchestration.ts` is a minimal factory delegating to provider adapters — don't re-introduce the controller.
- **Channel naming**: `domain:action` throughout (e.g. `files:readFile`, `git:status`, `config:get`). PTY data channels embed session ID: `pty:data:${id}`.
- **ESLint limits**: 40 lines/function, complexity 10. Large registrars extract pure helpers into companion `*Helpers.ts` files to stay compliant.
- **Session pruning**: `sessions.ts` caps at 100 JSON files, pruning oldest by `mtime` when exceeded.
- **Context cache re-exports**: `agentChat.ts` re-exports `warmSnapshotCache`, `invalidateSnapshotCache`, etc. from `agentChatContext.ts` — other handler files (`files.ts`, `git.ts`) import these via `agentChat.ts`, not directly.

## Dependencies

| Uses | For |
|---|---|
| `../config` | `getConfigValue`, `setConfigValue`, `store` |
| `../pty` | PTY spawn/write/resize/kill |
| `../web/webServer` | `broadcastToWebClients` for web-mode event parity |
| `../windowManager` | `getWindow` for per-window project roots |
| `../agentChat/` | Chat service, thread store, event projector, session memory |
| `../orchestration/` | Claude Code / Codex adapters, context packets, graph summaries |
| `../lsp/` | LSP lifecycle |
| `../contextLayer/` | Context layer controller |
| `../codebaseGraph/` | Graph controller |
| `../approvalManager` | Pre-execution approval response-file protocol |
| `../contributions/themeLoader` | Extension theme loading |
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
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
