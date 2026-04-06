<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The existing CLAUDE.md is already thorough, but reading the actual source reveals two patterns worth reinforcing: (1) the `sub-registrar vs primary registrar` split is the most confusing structural choice in this directory, and (2) path security has three distinct escape hatches (`isTrustedConfigPath`, `isTrustedVsxExtensionPath`, `assertPathAllowed`) that handlers pick from based on context — not one universal check.
`─────────────────────────────────────────────────`

# IPC Handlers — Domain-split `ipcMain.handle()` registrars

All Electron IPC handler registration lives here. Each file is a domain registrar that binds `ipcMain.handle()` calls. Imported and orchestrated by `../ipc.ts`.

## Key Files

| File | Role |
|---|---|
| `index.ts` | Barrel — re-exports every `register*Handlers` + cleanup helpers consumed by `../ipc.ts` |
| `pathSecurity.ts` | **Shared sandbox guard** — `assertPathAllowed()` validates paths against workspace roots. Imported by files, git, context, app, LSP, and symbol search handlers |
| `files.ts` | Filesystem ops — read/write/rename/delete/move, chokidar watchers, file dialogs, binary/image loading |
| `filesHelpers.ts` | Pure helpers for `files.ts` — directory listing, soft-delete, binary loading, error formatting |
| `git.ts` | Git ops — status, diff, log, commit, branch, stash, snapshot, blame |
| `gitOperations.ts` | Stage/unstage, checkout, revert, exec wrapper |
| `gitOperationsExtended.ts` | Changed files between refs, diff review, raw diff |
| `gitDiffParser.ts` | Unified diff parser — file-level change summaries from `git diff` output |
| `gitParsers.ts` | Parsers for `git log`, `git status`, `git blame` output |
| `gitBlameSnapshot.ts` | Blame snapshot capture and caching |
| `gitPatch.ts` | Patch application helpers |
| `config.ts` | Config CRUD — get/set/watch electron-store values, import/export settings JSON |
| `agentChat.ts` | Agent chat facade — thread CRUD, message sending, orchestration bridge, context cache control. **Re-exports** context cache helpers for `files.ts` / `git.ts` to import |
| `agentChatContext.ts` | Context snapshot warm/invalidate/load; background worker lifecycle |
| `agentChatOrchestration.ts` | `createMinimalOrchestration()` factory — delegates to Claude Code / Codex adapters |
| `sessions.ts` | Session persistence — save/load/export JSON in `userData/sessions/`, pruned to 100 files |
| `auth.ts` | OAuth token storage, provider login/logout, token refresh |
| `pty.ts` | Spawn, write, resize, kill, recording. Thin IPC shim over `../pty` |
| `app.ts` | Version info, app paths, window management, external URL launch |
| `mcp.ts` | MCP runtime — server lifecycle, tool invocation |
| `mcpStore.ts` | MCP registry fetch (`registry.modelcontextprotocol.io`), install to Claude Code settings |
| `mcpStoreSupport.ts` | Helpers for MCP store search and manifest parsing |
| `extensionStore.ts` | Top-level registrar — delegates to `extensionStoreApi.ts` and `extensionStoreMarketplace.ts` |
| `extensionStoreApi.ts` | Open VSX Registry fetch, VSIX download/extract/install, theme loading |
| `extensionStoreMarketplace.ts` | VS Code Marketplace search, detail fetch, download/install |
| `extensionStoreHelpers.ts` | Shared helpers — install from buffer, disabled list, broadcast utilities |
| `extensionStoreTypes.ts` | Extension store type definitions |
| `context.ts` | Thin IPC registration — delegates to scanner/generator/detector files |
| `contextScanner.ts` | Filesystem scanner — language, framework, package manager, entry point detection |
| `contextGenerator.ts` | Markdown generator — produces CLAUDE.md content from `ProjectContext` |
| `contextDetectors.ts` | Detection heuristics — framework/language/test-runner/build-tool classifiers |
| `contextDetectorsHelpers.ts` | Helper functions for detector heuristics |
| `contextTypes.ts` | Shared types — `ProjectContext`, `ContextGenerateOptions` |
| `claudeMd.ts` | CLAUDE.md generation service — whole-project and per-directory via `../claudeMdGenerator` |
| `graphHandlers.ts` | Codebase graph IPC — query, search, architecture, call-path tracing |
| `lspHandlers.ts` | LSP IPC — hover, completion, diagnostics, go-to-definition |
| `search.ts` | Filesystem content search |
| `miscSymbolSearch.ts` | Cross-file symbol search (regex-based) + shell history reading |
| `rulesAndSkills.ts` | Rules and skills file management |
| `orchestration.ts` | Orchestration IPC — context packet assembly, provider selection |
| `routerStats.ts` | Router feedback loop stats |
| `aiHandlers.ts` | AI provider handlers |
| `miscRegistrars.ts` | Sub-registrar collection — updater, cost, usage, crash logs, perf, symbols, approval |
| `miscRegistrarsHelpers.ts` | Window and extension handler sub-registrars |
| `misc.ts` | Thin aggregator — calls all `miscRegistrars` sub-registrars, exports `lspStopAll` |
| `ideTools.ts` | IDE tool server reverse channel — renderer responds to tool server queries |
| `pathSecurity.test.ts` | Unit tests for path sandbox validation |
| `gitDiffParser.test.ts` | Unit tests for the unified diff parser (inline fixtures, no filesystem) |

## Registration Patterns

Two co-existing signatures:

**Primary domain registrars** — exported in `index.ts`, called by `../ipc.ts`:
```ts
export function registerXxxHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = [];
  ipcMain.handle('domain:action', handler);
  channels.push('domain:action');
  return channels;
}
```

**Sub-registrars** — aggregated into `misc.ts` via `miscRegistrars.ts`:
```ts
export function registerXxxHandlers(channels: ChannelList): void {
  registerChannel(channels, 'domain:action', handler);
}
```

Primary registrars own their channel list and appear in `index.ts`. Sub-registrars receive a shared list from their aggregator (`misc.ts`) and do **not** appear in `index.ts`. New catch-all handlers go in `miscRegistrars.ts`, not `misc.ts` directly.

## Response Convention

All handlers return `{ success: true, ...data }` or `{ success: false, error: string }`. Each file defines its own local `ok()` / `fail()` helpers and type aliases (`HandlerSuccess<T>`, `HandlerFailure`) — do not import them across files.

## Path Security

`pathSecurity.ts` has three distinct guards — pick based on context:

| Function | Use when |
|---|---|
| `assertPathAllowed(event, path)` | User-supplied path inside the active workspace |
| `isTrustedConfigPath(path)` | Path is a `.md` file in `~/.claude/commands/` or `~/.claude/rules/` |
| `isTrustedVsxExtensionPath(path)` | Path is inside `~/.ouroboros/vsx-extensions/` (icon themes, fonts) |

Call `assertPathAllowed` before any filesystem touch on a user-supplied path:
```ts
const denied = assertPathAllowed(event, targetPath);
if (denied) return denied;
```

Validates against: per-window project roots (from `windowManager`) + configured multi-roots + `defaultProjectRoot`. Windows paths are compared case-insensitively. Denies by default if no workspace root is configured.

ESLint's `security/detect-non-literal-fs-filename` fires even on trusted paths (e.g. `app.getPath('userData')` + `readdir` results). Suppress with an explanatory comment — do not disable the rule file-wide.

## Gotchas

- **`agentChat.ts` is a re-export hub**: `files.ts` and `git.ts` import context cache helpers from `agentChat.ts`, not directly from `agentChatContext.ts`. This is intentional — don't "clean up" those imports.
- **Web client parity**: Handlers that push events to the renderer (watchers, config changes, agent events) must also call `broadcastToWebClients()` from `../web/webServer`.
- **No AgentLoopController**: Was removed as dead code. `agentChatOrchestration.ts` is a minimal factory. Don't re-introduce a controller layer.
- **Channel naming**: `domain:action` format (e.g. `files:readFile`, `git:status`). PTY data channels embed session ID: `pty:data:${id}`.
- **ESLint limits**: 40 lines/function, complexity 10. Large registrars extract pure helpers into companion `*Helpers.ts` files to stay compliant.
- **Session pruning**: `sessions.ts` caps at 100 JSON files, pruning oldest by `mtime` automatically.

## Dependencies

| Uses | For |
|---|---|
| `../config` | `getConfigValue`, `setConfigValue`, `store` |
| `../pty` | PTY spawn/write/resize/kill |
| `../web/webServer` | `broadcastToWebClients` for web-mode event parity |
| `../windowManager` | Per-window project roots (path security + event routing) |
| `../agentChat/` | Chat service, thread store, event projector, session memory |
| `../orchestration/` | Claude Code / Codex adapters, context packets, graph summaries |
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
