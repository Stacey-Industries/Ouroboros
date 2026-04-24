<!-- claude-md-auto:start -->

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# `src/main/web/` — HTTP + WebSocket server for browser-based IDE access

Serves the renderer UI over HTTP/WS instead of Electron's BrowserWindow, reusing all existing IPC handlers via a JSON-RPC 2.0 bridge. Zero changes to any handler file required.

## Key Files

| File | Role |
|------|------|
| `webServer.ts` | Express HTTP + WebSocket server. Static renderer assets, token auth middleware, SPA fallback with `window.__WEB_TOKEN__` injection. Default port 7890. |
| `webAuth.ts` | Token generation (32-byte random hex, persisted to electron-store), `crypto.timingSafeEqual` constant-time validation, per-IP rate limiting (10 attempts / 15 min window), inline login page HTML. |
| `webSocketBridge.ts` | JSON-RPC 2.0 ↔ IPC bridge. Parses WS messages, looks up handlers in `ipcHandlerRegistry`, calls them with a mock `IpcMainInvokeEvent`. Recursively encodes `Buffer`/`Uint8Array` → base64 for JSON transport. |
| `handlerRegistry.ts` | Captures IPC handlers by monkey-patching `ipcMain.handle` once via `installHandlerCapture()`. Every subsequent `handle()` call anywhere in the codebase auto-populates the registry. |
| `ptyBatcher.ts` | Batches high-frequency PTY output per session, flushes every 16ms (~60fps). Singleton `ptyBatcher`. Prevents per-byte WebSocket frames during active terminal output. |
| `broadcast.ts` | Unified event dispatch — sends to all Electron `BrowserWindow`s **and** all WebSocket clients. All main-process event push should use `broadcast()`, not `webContents.send` directly. |
| `index.ts` | Barrel export for the module. |

## Architecture

```
Browser → HTTP GET /       → Express static (renderer assets) + auth middleware
Browser → POST /api/login  → credential validation → sets auth cookies
Browser → WS /ws           → JSON-RPC 2.0 → handlerRegistry → IPC handlers
```

The capture is the core mechanism: `installHandlerCapture()` wraps `ipcMain.handle` so every handler registered anywhere in the codebase is simultaneously accessible to WebSocket clients — with no awareness of which transport they're on.

## Auth Flow

1. Token auto-generated on first access, persisted to electron-store as `webAccessToken`
2. Three auth methods checked in order: cookie (`webAccessToken`) → query param (`?token=`) → `Authorization: Bearer`
3. Query param auth upgrades to cookie — sets `webAccessToken` (HttpOnly) only, then redirects to clean URL
4. WebSocket connections authenticate via `?ticket=` (primary) — JS shim calls `POST /api/ws-ticket` before opening WS and appends the one-time ticket to the upgrade URL. Legacy `wsToken` cookie fallback remains until v1.4.0 (logs a warn when used).
5. Unauthenticated browser requests get the inline login page HTML; API clients get `401` JSON
6. If `webAccessPassword` is configured, `validateCredential` accepts it; otherwise falls back to the token
7. `/api/health` is intentionally public — no auth required
8. `POST /api/ws-ticket` issues a 30-second, single-use ticket stored in-memory. Requires `webAccessToken` HttpOnly cookie (goes through `authMiddleware`). The ticket is consumed on first successful WS upgrade.

## Gotchas

- **`installHandlerCapture()` call order is critical** — must run in `main.ts` before any `ipcMain.handle` registration (before `registerIpcHandlers`). Handlers registered before the patch are invisible to web clients.
- **WS ticket replaces non-HttpOnly wsToken cookie** — the former `wsToken` cookie was readable by JS (XSS risk). The ticket exchange (`POST /api/ws-ticket` → `?ticket=X` on WS upgrade) eliminates the persistent readable token. The cookie is no longer set on login or query-param redirect.
- **SPA fallback injects `window.__WEB_TOKEN__`** — inserted into `<head>` of cached `index.html` so `src/web/webPreload.ts` can bootstrap the WS connection. Cross-directory coupling.
- **`index.html` is cached in memory** — `cachedIndexHtml` is read from disk once and never invalidated. If the renderer build changes while the server is running, the stale HTML persists until restart.
- **Mock IPC event uses `windows[0]`** — `createMockIpcEvent()` picks the first active `BrowserWindow`. Handlers relying on specific window identity may behave unexpectedly for web clients.
- **Binary encoding is recursive** — `encodeForTransport` in `webSocketBridge.ts` traverses the entire result tree. Large nested Buffers are fully walked before the response is sent.
- **Rate limiter is in-memory only** — resets on app restart. Stale entries are evicted lazily on each `isRateLimited()` call, not proactively.

## Dependencies

| This module uses | For |
|-----------------|-----|
| `../config` | Token persistence (`getConfigValue`, `setConfigValue`) |
| `../windowManager` | `getAllActiveWindows()` — mock IPC event sender + broadcast targets |
| `express`, `ws` | HTTP and WebSocket server (npm) |

| Used by | For |
|---------|-----|
| `../main.ts` | `installHandlerCapture()` at boot; `startWebServer()` / `stopWebServer()` lifecycle |
| `src/web/webPreload.ts` | Client-side WS transport that speaks this server's JSON-RPC protocol |
| PTY / hooks modules | `broadcast()` for event push; `ptyBatcher.append()` for batched terminal data |
