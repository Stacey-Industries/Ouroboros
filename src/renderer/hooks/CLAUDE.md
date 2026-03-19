<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
**Hook decomposition pattern**: The `useX.ts` / `useX.effects.ts` / `useX.handlers.ts` / `useX.sync.ts` split is a deliberate architectural choice — it keeps each file under ~300 lines and separates effects (side-effect-heavy `useEffect` logic), handlers (stable callback references), and sync (persistence/IPC sync). The `.ts` entry file acts purely as an assembler. This mirrors how large components get decomposed, applied at the hook level.

**Two subagent-linking strategies coexist** in `useAgentEvents.helpers.ts`: an explicit path (child session ID present in tool input — reliable) and a temporal stamp path (no ID yet — uses a 30-second window to auto-link a subsequent `agent_start` as the child). The 30-second window isn't arbitrary — it accounts for Claude Code model-load latency in subagent initialization.

**`directoryWatchRegistry`** solves a subtle IPC fan-out problem: if three different components each call `files:watchDir` on the same path, you'd get three IPC channels and three sets of callbacks. The registry deduplicates at the renderer level, keeping a single IPC subscription per directory regardless of how many hooks are watching it.
`─────────────────────────────────────────────────`

The CLAUDE.md has been written to `src/renderer/hooks/CLAUDE.md`. It covers:

- **Full file map** for all 43 files with their roles
- **Split-hook naming convention** (`useX.ts` / `effects` / `handlers` / `sync` / `actions`) with the key rule that entry files are pure assemblers
- **Two event systems** distinction — the most common source of confusion in this codebase
- **Non-obvious gotchas**: `appEventNames.ts` as canonical event name source, `useSymbolOutline` being regex-only, the dual subagent-linking strategies, and the 100-snapshot cap
- **Dependencies** pointing to the contexts and type files consumed
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# Renderer Hooks

All shared React hooks for the renderer process — IPC bridges, session management, agent monitoring, theming, git, and app-wide event wiring.

## File Map

| File                                            | Role                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `appEventNames.ts`                              | **Single source of truth** for DOM custom event name constants (`agent-ide:*`)                     |
| `useConfig.ts`                                  | Read/write `electron-store` config via IPC — optimistic updates with rollback on error             |
| `useTheme.ts`                                   | Theme application: CSS var injection, font config, title bar overlay, extension theme registration |
| `useAgentEvents.ts`                             | Subscribes to Claude Code hook events; drives `AgentMonitor` state via `useReducer`                |
| `useAgentEvents.helpers.ts`                     | Reducer + `AgentState`/`AgentAction` types; subagent linking logic with temporal stamps            |
| `useAgentEvents.payload.ts`                     | Parses raw `HookPayload` into typed actions; `deriveTaskLabel`, `createToolCall`, etc.             |
| `useTerminalSessions.ts`                        | Entry point — assembles spawners, handlers, sync, and restore into one return object               |
| `useTerminalSessions.effects.ts`                | `useSessionSpawners`, `useRestoreSessions`, `useKillTimers` — spawn/restore/kill timer logic       |
| `useTerminalSessions.handlers.ts`               | Close, restart, title-change, reorder, split, recording toggle handlers                            |
| `useTerminalSessions.sync.ts`                   | Persistence sync, Claude session capture, recording state sync from IPC                            |
| `useSessionManager.ts`                          | Thin wrapper over `useSessionManagerActions`; assembles `terminalControl` prop for `AppLayout`     |
| `useSessionManager.actions.ts`                  | All session action implementations (spawn, close, restart, split, recording)                       |
| `useSessionManager.helpers.ts`                  | `ClaudeSessionOptions` type + `useSessionManagerActions` factory                                   |
| `useAppEventListeners.ts`                       | Exports `useMenuEvents` (Electron menu IPC) and `useDomEventListeners` (DOM `agent-ide:*` events)  |
| `useAppKeyboardShortcuts.ts`                    | Global keyboard shortcut registration for the app                                                  |
| `useCommandRegistrations.ts`                    | Registers commands into the command palette                                                        |
| `useInnerAppEffects.ts`                         | App-level side effects (project init, layout restore, etc.)                                        |
| `useDiffSnapshots.ts`                           | Captures git HEAD hash at agent session start/end; persists to config                              |
| `useGitStatus.ts`                               | Polls `git:status` — modified/untracked file counts                                                |
| `useGitStatusDetailed.ts`                       | Full per-file git status with staged/unstaged breakdown                                            |
| `useGitBranch.ts`                               | Current branch name, polling                                                                       |
| `useGitDiff.ts`                                 | `git:diff` for a specific file                                                                     |
| `useGitBlame.ts`                                | `git:blame` for a file                                                                             |
| `useSymbolOutline.ts`                           | Pure regex-based symbol outline (functions, classes, types) for TS/JS/MD/Python — no LSP           |
| `useFileWatcher.ts`                             | Watches directories via `files:watchDir`; fires callbacks on changes                               |
| `useFileHeatMap.ts`                             | Tracks agent-touched files; computes heat scores for file tree highlighting                        |
| `useProjectFileIndex.ts`                        | Flat file index for the open project (fast symbol/file search)                                     |
| `useFileTreeDirtySync.ts`                       | Syncs dirty (unsaved) file state into the file tree                                                |
| `useSessionAnalytics.ts`                        | Aggregates tool usage, duration, cost metrics from `AgentSession[]`                                |
| `useCostTracking.ts`                            | Lightweight token/cost accumulator                                                                 |
| `usePerformance.ts`                             | Renderer performance metrics (frame budget, IPC latency)                                           |
| `useProgressSubscriptions.ts`                   | Subscribes to progress events from main (long-running operations)                                  |
| `useIdeToolResponder.ts`                        | Responds to IDE tool calls from an agent (open file, run terminal, etc.)                           |
| `useWorkspaceLayouts.ts`                        | Saved/named workspace layout CRUD                                                                  |
| `useUpdater.ts`                                 | Auto-update check and install via `app.onUpdateAvailable`                                          |
| `usePty.ts`                                     | Low-level PTY data/resize/title IPC bindings for a single terminal session                         |
| `useToast.ts`                                   | Toast notification queue + helpers; consumed by `ToastContext`                                     |
| `useExtensionThemes.ts`                         | Loads and registers extension-provided themes                                                      |
| `useErrorCapture.ts`                            | Window `error`/`unhandledrejection` → IPC error reporting                                          |
| `useProjectManagement.ts`                       | Open/close project, recent projects list                                                           |
| `useSessionReplay.ts` / `agentChatUiHelpers.ts` | Session replay controls; chat UI status toast helpers                                              |
| `directoryWatchRegistry.ts`                     | Singleton registry — deduplicates `files:watchDir` subscriptions across hook instances             |

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

## Dependencies

- Contexts consumed: `ProjectContext`, `AgentEventsContext`, `ToastContext`
- IPC surface: `window.electronAPI` — typed in `src/renderer/types/electron.d.ts`
- Agent session types: `src/renderer/components/AgentMonitor/types.ts`
- Terminal session type: `src/renderer/components/Terminal/TerminalTabs.tsx`
