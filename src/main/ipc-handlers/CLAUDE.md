<!-- claude-md-manual:preserved -->
# IPC Handlers — Domain-split `ipcMain.handle()` registrars

All Electron IPC handler registration lives here. Each file is a domain registrar that binds `ipcMain.handle()` calls and returns a list of registered channel names. Imported and orchestrated by `../ipc.ts`.

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

Two co-existing signatures exist: primary domain registrars (exported in `index.ts`, called by `../ipc.ts`) and sub-registrars (aggregated into `misc.ts` via `miscRegistrars.ts`, receiving a shared channel list). New catch-all handlers go in `miscRegistrars.ts`, not `misc.ts` directly.

## Response Convention

All handlers return `{ success: true, ...data }` or `{ success: false, error: string }`. Each file defines local type aliases (`HandlerSuccess<T>`, `HandlerFailure`) — don't import them across files.

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
- **`misc.ts` vs `miscRegistrars.ts`**: `misc.ts` is the thin aggregator. Add new catch-all handlers as sub-registrar functions in `miscRegistrars.ts`, not directly in `misc.ts`.
- **Web client broadcasts**: Handlers pushing events to the renderer (watchers, config changes, agent chat events) must also call `broadcastToWebClients()` from `../web/webServer` for web-mode parity.
- **No AgentLoopController**: Was removed as dead code. `agentChatOrchestration.ts` is a minimal factory. Don't re-introduce a controller layer.
- **Channel naming**: `domain:action` format throughout (e.g. `files:readFile`, `git:status`). PTY data channels embed session ID: `pty:data:${id}`.
- **ESLint limits**: 40 lines/function, complexity 10. Large registrars extract pure helpers into companion `*Helpers.ts` files to stay compliant.
- **Session pruning**: `sessions.ts` caps at 100 JSON files, pruning oldest by `mtime` automatically.
