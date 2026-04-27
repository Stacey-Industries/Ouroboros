<!-- claude-md-manual:preserved -->
# Renderer Hooks

All shared React hooks for the renderer process — IPC bridges, session management, agent monitoring, theming, git, and app-wide event wiring.

## Naming Conventions

Large hooks are **split by concern** using a suffix pattern:

```
useX.ts           — public entry: assembles pieces, exports the return type
useX.helpers.ts   — types, reducer, pure utility functions
useX.effects.ts   — useEffect-heavy spawning/restore/timer logic
useX.handlers.ts  — event handler callbacks (close, restart, etc.)
useX.actions.ts   — action implementations with IPC calls
useX.sync.ts      — side-effect syncs (persist, recording, capture)
```

The `.ts` entry file should have no business logic — it only wires the pieces.

## Key Patterns

**Two event systems — never mix them:**

- **Electron IPC** via `window.electronAPI.*` — for `menu:*` events and all IPC channels
- **DOM CustomEvents** (`window.dispatchEvent` / `window.addEventListener`) — for renderer-only cross-component signaling using `agent-ide:*` names from `appEventNames.ts`

**IPC event subscription pattern** — subscriptions always return a cleanup function:

```ts
useEffect(() => {
  return window.electronAPI.hooks.onAgentEvent((event) => { ... });
}, []);
```

**`useConfig` optimistic updates** — `set()` updates local state immediately, calls IPC, and reverts to previous value on failure. Never call `config.getAll()` directly elsewhere — use `useConfig`.

**`useAgentEvents` reducer** — uses `useReducer` with all state in `AgentState`. Subagent linking uses two mechanisms: explicit `childSessionId` in tool input (fast path) and temporal stamping within a 30-second window (fallback for slow model loads).

**`directoryWatchRegistry`** — prevents duplicate `files:watchDir` IPC calls when multiple components watch the same path. Always go through this registry, not bare `watchDir`.

## Gotchas

- `appEventNames.ts` is the canonical list of DOM event names. Always import from here — don't hardcode `'agent-ide:...'` strings in components.
- `useSymbolOutline` is **regex-only** — no LSP. It's intentionally fast and dependency-free; use it for sidebar outlines, not for accurate semantic analysis.
- `useDiffSnapshots` caps at 100 snapshots (`MAX_SNAPSHOTS`). Older snapshots are dropped silently.
- `useAppEventListeners` exports **two separate hooks** (`useMenuEvents` + `useDomEventListeners`) — both must be called from `InnerApp` for full event coverage.
- Stale tool calls in `useAgentEvents.helpers` auto-resolve after 120 seconds (`STALE_TOOL_CALL_MS`) — this prevents stuck "running" tool indicators when `post_tool_use` events are dropped.
