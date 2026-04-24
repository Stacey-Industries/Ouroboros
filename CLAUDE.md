# Ouroboros — Claude Code Instructions

Agent-first Electron desktop IDE for launching/monitoring Claude Code sessions. Three-process architecture (main → preload → renderer) with strict context isolation. **Built by Claude Code, running inside itself.**

## Meta-Development Warning

This project is developed from within itself. Claude Code runs as a terminal session inside the Ouroboros — the very app being edited.

- `npm run dev` is safe — it spawns its own Electron instance separate from the host. The host IDE keeps running unless explicitly closed.
- Killing electron processes is permitted when needed. The host IDE is one of those processes; the user may have to relaunch it afterwards.
- Hot-reload (`npm run dev` / Vite HMR) updates the renderer in-place without killing the window. Main-process changes require a relaunch.
- For renderer-only changes, ask the user to reload with `Ctrl+R`. For main-process changes, ask them to relaunch.

## Commands

- `npm run dev` — start dev server + Electron (hot-reload renderer)
- `npm run build` — production build (electron-vite)
- `npm run dist` — build + package with electron-builder
- `npm test` — run vitest (unit tests)
- `npm run test:watch` — vitest in watch mode

## Key Files

| File                               | Role                                       |
| ---------------------------------- | ------------------------------------------ |
| `src/main/main.ts`                 | Electron entry point                       |
| `src/main/ipc.ts`                  | All IPC handlers                           |
| `src/main/pty.ts`                  | node-pty session management                |
| `src/main/hooks.ts`                | Named pipe server for Claude Code events   |
| `src/main/config.ts`               | electron-store schema + persistence        |
| `src/preload/preload.ts`           | contextBridge — typed `window.electronAPI` |
| `src/renderer/App.tsx`             | Root React component                       |
| `src/renderer/types/electron.d.ts` | Single source of truth for IPC shapes      |

## Folder Map

| Path                       | Contents                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/main/`                | Node.js main process — IPC, PTY, hooks server, config                                           |
| `src/preload/`             | contextBridge — typed API surface                                                               |
| `src/renderer/components/` | Feature folders: Layout, Terminal, FileTree, FileViewer, AgentMonitor, CommandPalette, Settings |
| `src/renderer/hooks/`      | Shared hooks: useConfig, useTheme, usePty, useAgentEvents, useFileWatcher                       |
| `src/renderer/contexts/`   | React contexts: ProjectContext                                                                  |
| `src/renderer/themes/`     | Theme definitions (retro, modern, warp, cursor, kiro, glass, light, high-contrast)              |
| `src/renderer/types/`      | `electron.d.ts` — full IPC type contract                                                        |

Each subdirectory has its own `CLAUDE.md` with a subsystem-specific file map.

## Codebase Graph

The repo is indexed in the codebase-memory graph (~1.4K nodes, ~2.3K edges). Auto-sync keeps it fresh. See `~/.claude/rules/graph-tool-routing.md` for when to use graph tools vs Grep/Read.

## Key Conventions

### Two Event Systems — Don't Confuse Them

1. **Electron IPC** — `ipcRenderer.on` / `ipcMain.handle` via preload bridge (`menu:new-terminal`, `pty:data:${id}`)
2. **DOM CustomEvents** — `window.dispatchEvent` / `window.addEventListener` (`agent-ide:new-terminal`, `agent-ide:set-theme`, `agent-ide:open-settings`)

Never mix these. IPC events flow through preload. DOM events are renderer-only.

### Per-Window Project Isolation

Each window owns its project roots independently via `ManagedWindow.projectRoots` in `windowManager.ts`. The renderer persists roots per-window via `window.setProjectRoots()` IPC (not the global `multiRoots` config key). `pathSecurity` reads per-window roots first, with `defaultProjectRoot` as a cold-boot fallback only. Window sessions (roots + bounds) are persisted to `sessionsData` (SQLite) and restored on relaunch.

## Known Issues / Tech Debt

- Background job queue concurrency cap and queue length cap (50) are hardcoded — expose as settings when the feature matures.
- `refs/ouroboros/checkpoints/<threadId>` refs accumulate over time — GC policy (keep last 50) runs lazily on next checkpoint capture, not on a schedule.
- `ecosystem.rulesAndSkillsInstallEnabled` defaults false — the rules-and-skills install path is not yet wired end-to-end. Remove flag and default to true when wired.
- `tokenStorage` localStorage-on-web (MED) — elevate to HIGH only when web mode is exposed beyond trusted networks.
- Wave 19 PageRank convergence at 10k cyclic nodes — bounded and non-DoS; profile in practice before tuning `maxIterations`.
- `AnyOverrides = Record<string, any>` in Wave 26 profile code — one-line type escape hatch; fix when the surrounding code is next refactored.

## Further Reading

- `docs/architecture.md` — Full architecture, component tree, state management, ownership rules, security model
- `docs/api-contract.md` — Complete IPC channel reference, file operations, PTY API
- `docs/data-model.md` — Config schema, state types, event types
- `docs/build.md` — Build tooling, Vite config, Monaco workers, path aliases, bundle analysis
- `docs/chat-shell.md` — Chat-only shell (Wave 42+), workbench variant (Wave 46), material theming (Wave 45)
- `ai/vision.md` — Product vision, design north stars
- `ai/deferred.md` — Remaining unimplemented features, prioritized by area

## Rules, Hooks, and Commands

Context-specific rules are in `.claude/rules/` (injected automatically by glob match). Hooks enforce constraints deterministically via `.claude/settings.json`. Slash commands are in `.claude/commands/` (project) and `~/.claude/commands/` (global).
