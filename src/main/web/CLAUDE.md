<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
Three architectural choices in this module are worth noting:

1. **Monkey-patching `ipcMain.handle`** is the zero-friction way to make all IPC handlers available over WebSocket without touching any handler file — but it creates a hard call-order dependency that's invisible at the call sites. The `captureInstalled` guard makes it idempotent, which is important since module evaluation order isn't always obvious.

2. **Two cookies for one token** exists because the browser WebSocket API (`new WebSocket(url)`) offers no way to set custom headers — you can only pass a URL. So the `wsToken` cookie must be non-HttpOnly so JS can read it and attach it as a query parameter, while the HttpOnly `webAccessToken` cookie is used for regular HTTP requests where the browser attaches cookies automatically.

3. **`ptyBatcher`'s 16ms window** isn't arbitrary — it matches the browser's `requestAnimationFrame` cadence (~60fps). node-pty can emit data many times per millisecond during heavy output. Without batching, each byte would be a separate WebSocket frame, saturating the network and overwhelming the browser's message event loop.
   `─────────────────────────────────────────────────`

The CLAUDE.md is written. The key changes from the previous version: removed the meta-comment scaffolding (`<!-- claude-md-auto:start -->` / `<!-- claude-md-manual:preserved -->`) that contained notes-about-the-doc rather than actual documentation, and produced a clean standalone file.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# Web Remote Access — HTTP + WebSocket server for browser-based IDE access

Serves the same renderer UI over HTTP/WS instead of Electron's BrowserWindow, reusing all existing IPC handlers via a JSON-RPC 2.0 bridge.

## Key Files

| File                 | Role                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webServer.ts`       | Express HTTP server + WebSocket server. Serves static renderer assets, token auth middleware, SPA fallback with token injection. Default port 7890.                                                        |
| `webAuth.ts`         | Token generation (32-byte random, persisted to config), constant-time validation (`crypto.timingSafeEqual`), per-IP rate limiting (10 attempts / 15 min), inline login page HTML.                          |
| `webSocketBridge.ts` | JSON-RPC 2.0 ↔ IPC bridge. Parses incoming WS messages, looks up handlers in `ipcHandlerRegistry`, calls them with a mock `IpcMainInvokeEvent`, encodes binary (Buffer/Uint8Array → base64) for transport. |
| `handlerRegistry.ts` | Shared registry that captures IPC handlers. `installHandlerCapture()` monkey-patches `ipcMain.handle` to intercept all registrations — must be called ONCE before any handler registration in `main.ts`.   |
| `ptyBatcher.ts`      | Batches high-frequency PTY output into 16ms (~60fps) flushes. Singleton `ptyBatcher` instance. Avoids per-byte WebSocket frames during rapid terminal output.                                              |
| `broadcast.ts`       | Unified event dispatch — sends to both Electron BrowserWindows and WebSocket clients. All main-process event broadcasting should go through `broadcast()`.                                                 |
| `index.ts`           | Barrel export.                                                                                                                                                                                             |

## Architecture

```
Browser → HTTP GET /  → Express static (renderer assets) + token auth
Browser → WS /ws      → JSON-RPC 2.0 → handlerRegistry → same IPC handlers as Electron
```

The key mechanism: `installHandlerCapture()` wraps `ipcMain.handle` so every handler registered anywhere in the codebase is automatically accessible to WebSocket clients. Zero changes to any existing handler file required.

## Auth Flow

1. Token auto-generated on first access, persisted to electron-store (`webAccessToken` config key)
2. Three auth methods: cookie (`webAccessToken`), query param (`?token=`), or `Authorization: Bearer` header
3. Query param auth sets HttpOnly cookie + non-HttpOnly `wsToken` cookie, then redirects to clean URL
4. WebSocket connections authenticated via `?token=` query param or `wsToken` cookie (non-HttpOnly so JS can read it)
5. Unauthenticated browser requests get the inline login page HTML; API clients get `401` JSON

## Gotchas

- **`installHandlerCapture()` call order is critical** — must run before ANY `ipcMain.handle` call or those handlers won't be in the registry and WS clients will get "method not found". Called in `main.ts` at boot, before `registerIpcHandlers`.
- **Mock IPC event uses first active BrowserWindow** — `createMockIpcEvent()` grabs `windows[0]` as the sender. Handlers that rely on specific window identity may behave unexpectedly for web clients.
- **Two cookies are needed** — `webAccessToken` is HttpOnly (used by HTTP middleware), `wsToken` is non-HttpOnly (read by JS for WebSocket auth). The browser WebSocket API cannot send custom headers.
- **SPA fallback injects token via `<script>` tag** — `window.__WEB_TOKEN__` is set in the HTML `<head>` so `src/web/webPreload.ts` can read it for WebSocket auth. Cross-directory dependency.
- **Binary encoding is recursive** — `encodeForTransport` walks the entire result tree. Large responses with nested Buffers will be fully traversed before being sent.
- **Rate limiter is in-memory only** — resets on app restart. Stale entries are cleaned lazily on each `isRateLimited()` call.

## Dependencies

| This module uses   | For                                                               |
| ------------------ | ----------------------------------------------------------------- |
| `../config`        | Token persistence (`getConfigValue`, `setConfigValue`)            |
| `../windowManager` | Mock IPC event sender + broadcast targets (`getAllActiveWindows`) |
| `express`, `ws`    | HTTP/WebSocket server (npm packages)                              |

| Used by                 | For                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `../main.ts`            | `installHandlerCapture()` at startup; `startWebServer()` / `stopWebServer()` lifecycle |
| `src/web/webPreload.ts` | Client-side WS transport that speaks to this server                                    |
| PTY and hooks modules   | `broadcast()` and `ptyBatcher.append()` for event delivery to web clients              |
