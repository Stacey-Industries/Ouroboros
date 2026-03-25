<!-- claude-md-auto:start -->
# src/main/web/ — HTTP + WebSocket server for browser-based IDE access

Serves the renderer UI over HTTP/WS instead of Electron's BrowserWindow, reusing all existing IPC handlers via a JSON-RPC 2.0 bridge. Zero handler-file changes required.

## Key Files

| File                 | Role                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webServer.ts`       | Express HTTP server + WebSocket server. Static renderer assets, token auth middleware, SPA fallback with `window.__WEB_TOKEN__` injection. Default port 7890.                                            |
| `webAuth.ts`         | Token generation (32-byte random hex, persisted to electron-store), constant-time `timingSafeEqual` validation, per-IP rate limiting (10 attempts / 15 min window), inline login page HTML.              |
| `webSocketBridge.ts` | JSON-RPC 2.0 ↔ IPC bridge. Parses incoming WS messages, looks up handlers in `ipcHandlerRegistry`, calls them with a mock `IpcMainInvokeEvent`, recursively encodes Buffer/Uint8Array → base64 for JSON. |
| `handlerRegistry.ts` | Captures IPC handlers via `installHandlerCapture()`, which monkey-patches `ipcMain.handle` once at startup. Every subsequent `handle()` call anywhere in the codebase auto-populates the registry.      |
| `ptyBatcher.ts`      | Batches high-frequency PTY data per session, flushes every 16ms (~60fps). Singleton `ptyBatcher`. Prevents per-byte WebSocket frames during active terminal output.                                     |
| `broadcast.ts`       | Unified event dispatch — sends to all Electron `BrowserWindow`s **and** all WebSocket clients in one call. All main-process event push should go through `broadcast()`.                                 |
| `index.ts`           | Barrel export for the module.                                                                                                                                                                            |

## Architecture

```
Browser  →  HTTP GET /     →  Express static (renderer assets) + auth middleware
Browser  →  POST /api/login →  credential validation → sets auth cookies
Browser  →  WS /ws         →  JSON-RPC 2.0 → handlerRegistry → IPC handlers
```

The handler capture is the key mechanism: wrapping `ipcMain.handle` once means WebSocket clients can call any IPC channel by name, with no awareness of which transport they're on.

## Auth Flow

1. Token auto-generated on first use, stored in electron-store under `webAccessToken`.
2. Three auth methods checked in order: cookie (`webAccessToken`), query param (`?token=`), `Authorization: Bearer`.
3. Query param auth upgrades to cookie — sets `webAccessToken` (HttpOnly) + `wsToken` (non-HttpOnly), then redirects to clean URL.
4. WebSocket connections authenticate via `?token=` query param or `wsToken` cookie. `wsToken` must be **non-HttpOnly** so the JS renderer can read it for WebSocket auth (the browser WebSocket API cannot send custom headers).
5. Unauthenticated browser requests receive the inline login page; API clients get `401 JSON`.
6. If `webAccessPassword` is configured, `validateCredential` uses it; otherwise falls back to the token.

## Gotchas

- **`installHandlerCapture()` call order is critical** — must run in `main.ts` before any `ipcMain.handle` registration (i.e. before `registerIpcHandlers`). Handlers registered before the patch are invisible to web clients.
- **Two cookies, two purposes** — `webAccessToken` is HttpOnly (HTTP middleware), `wsToken` is non-HttpOnly (read by JS to authenticate WebSocket). Don't collapse them into one.
- **SPA fallback injects `window.__WEB_TOKEN__`** — injected into `<head>` of cached `index.html` so `src/web/webPreload.ts` can bootstrap the WebSocket connection. Cross-directory coupling.
- **Mock IPC event uses `windows[0]`** — `createMockIpcEvent()` picks the first active BrowserWindow as the sender. Handlers relying on specific window identity may behave differently for web clients.
- **Binary encoding is recursive** — `encodeForTransport` walks the entire response object. Large nested Buffers are fully traversed before the response is sent.
- **Rate limiter is in-memory** — resets on app restart. Stale entries are lazily evicted on each `isRateLimited()` call, not proactively.
- **`/api/health` is exempt from auth** — intentionally public, used for uptime checks.

## Dependencies

| Uses                    | For                                                                |
| ----------------------- | ------------------------------------------------------------------ |
| `../config`             | Token persistence (`getConfigValue` / `setConfigValue`)            |
| `../windowManager`      | `getAllActiveWindows()` — mock IPC event sender + broadcast targets |
| `express`, `ws`         | HTTP and WebSocket server (npm)                                    |

| Used by                 | For                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `../main.ts`            | `installHandlerCapture()` at boot; `startWebServer()` / `stopWebServer()` lifecycle      |
| `src/web/webPreload.ts` | Client-side WS transport that speaks this server's JSON-RPC protocol                    |
| PTY / hooks modules     | `broadcast()` for event push; `ptyBatcher.append()` for batched terminal data delivery  |
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
