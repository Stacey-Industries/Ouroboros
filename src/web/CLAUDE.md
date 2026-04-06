<!-- claude-md-auto:start -->
Now I have a complete picture. Here's the CLAUDE.md:

```markdown
# src/web/ — WebSocket IPC Shim for Web Mode

Provides `window.electronAPI` in web/browser deployments by routing all IPC calls through a WebSocket JSON-RPC transport instead of Electron's `ipcRenderer`. The API surface is intentionally identical to the Electron preload so the React app runs unchanged in both environments.

## Key Files

| File | Role |
|---|---|
| `webPreload.ts` | IIFE entry point — instantiates transport, assembles all API namespaces, sets `window.electronAPI`, adds `web-mode` class to `<html>` |
| `webPreloadTransport.ts` | `WebSocketTransport` class — JSON-RPC over WebSocket with reconnect, timeouts, binary deserialization, and connection overlay UI |
| `webPreloadApis.ts` | API builders (first half): `buildPtyApis`, `buildCoreApis`, `buildFilesApi`, `buildGitApi`, `buildHooksApi`, `buildShellThemeApis`, `buildAppApi` |
| `webPreloadApisSupplemental.ts` | API builders (second half): approval, sessions, cost, usage, updater, LSP, window, MCP, extension store, context, agent chat, orchestration, context layer |
| `webPreloadApisAuth.ts` | Auth and providers API builders |
| `webPreloadApisClaudeMd.ts` | `claudeMd` API builder |
| `webPreloadApisRulesSkills.ts` | `rulesAndSkills` API builder — rules CRUD, hooks config, claude settings, commands, skills |

## Architecture

```
webPreload.ts (IIFE)
  └── WebSocketTransport  →  ws://host/ws
        ├── t.invoke(channel, ...args)  →  JSON-RPC request (with 30s timeout)
        └── t.on(channel, cb)           →  push event subscription (returns cleanup fn)

All API builder functions take (t: WebSocketTransport) and return typed method maps.
These are split across files only to stay within the max-lines-per-function/file limits.
```

## Protocol Details

- **Requests**: `{ jsonrpc: "2.0", id, method: channel, params: args[] }`
- **Responses**: `{ id, result }` or `{ id, error: { message } }`
- **Push events**: `{ method: "event", params: { channel, payload } }`
- **Binary data**: results with `{ __binary: true, data: base64 }` are decoded to `Uint8Array`
- **Auth**: token passed as `?token=` query param on the WebSocket URL, sourced from `window.__WEB_TOKEN__` or the `wsToken` cookie

## Desktop-Only Stubs

`desktopOnlyStub(channel)` — returns `{ success: false, cancelled: true, error }` async  
`desktopOnlyNoop()` — returns `{ success: true }` async  
Used for APIs that have no meaningful web equivalent (e.g., native file picker dialogs — the web version routes through `WebFolderBrowserSupport` instead).

## Gotchas

- **IIFE bundle ordering**: `webPreload.ts` must be injected into `index.html` before the React bundle. `vite.web.config.ts` handles this via `transformIndexHtml`. Breaking the ordering causes `window.electronAPI` to be undefined when the app bootstraps.
- **`web-mode` class**: Set on `document.documentElement` by `webPreload.ts`. Used in CSS to conditionally hide/style desktop-only UI elements.
- **`openExternal` web override**: `auth.openExternal` calls `window.open` directly rather than routing through the transport — the only place where web mode diverges from pure proxying.
- **Reconnect is exponential back-off**: `WebSocketTransport.scheduleReconnect` uses `1000 * 2^attempts`, capped at 30s. In-flight requests at disconnect time are all rejected immediately with "connection closed".
- **MonacoEnvironment**: Configured in `webPreload.ts` (not in the renderer) because web mode serves workers from `/monacoeditorwork/` without Vite's worker bundling. Must execute before Monaco initializes.
- **API split is cosmetic**: `webPreloadApis.ts` + `webPreloadApisSupplemental.ts` are one logical unit, split only to comply with `max-lines: 300`. Don't merge them.

## Relationship to Electron Preload

| | Electron | Web |
|---|---|---|
| Transport | `ipcRenderer.invoke` / `ipcRenderer.on` | `WebSocketTransport.invoke` / `t.on` |
| Source of truth for shape | `src/preload/preload.ts` + `preloadSupplementalApis.ts` | `src/web/webPreload.ts` (mirrors it) |
| Type contract | `src/renderer/types/electron.d.ts` | same — shared |

When adding a new IPC channel: add it to `electron.d.ts`, implement in `src/main/`, wire in `src/preload/`, and mirror in the appropriate `src/web/webPreloadApis*.ts` file.
```
<!-- claude-md-auto:end -->
