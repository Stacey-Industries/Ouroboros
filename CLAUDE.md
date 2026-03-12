# Ouroboros — Claude Code Guidelines

## What This Is
Agent-first Electron desktop IDE for launching/monitoring Claude Code sessions. Three-process architecture (main → preload → renderer) with strict context isolation. **Built by Claude Code, running inside itself.** The agent makes implementation decisions autonomously; the human steers direction and reviews.

## Meta-Development Warning
**This project is developed from within itself.** Claude Code runs as a terminal session inside the Ouroboros — the very app being edited. This means:
- **NEVER kill Electron processes or run `taskkill /IM electron.exe`** — that kills the host IDE and terminates this session.
- **NEVER `npm run dev` expecting a fresh window** — a running instance is already open (the one you're inside). Starting a second instance is fine for testing but don't assume the current window needs restarting.
- Hot-reload (`npm run dev` / vite HMR) updates the renderer in-place without killing the window. Prefer that over full restarts.
- If you need the user to test a change, ask them to reload the renderer (`Ctrl+R` inside the IDE) rather than restarting the app.

## Commands
- `npm run dev` — start dev server + Electron (hot-reload renderer)
- `npm run build` — production build (electron-vite)
- `npm run dist` — build + package with electron-builder
- `npm test` — run vitest (unit tests)
- `npm run test:watch` — vitest in watch mode

## Quick Reference

### Key Files
| File | Role |
|---|---|
| `src/main/main.ts` | Electron entry point |
| `src/main/ipc.ts` | All IPC handlers |
| `src/main/pty.ts` | node-pty session management |
| `src/main/hooks.ts` | Named pipe server for Claude Code events |
| `src/main/config.ts` | electron-store schema + persistence |
| `src/preload/preload.ts` | contextBridge — typed `window.electronAPI` |
| `src/renderer/App.tsx` | Root React component |
| `src/renderer/types/electron.d.ts` | Single source of truth for IPC shapes |

### Folder Map
| Path | Contents |
|---|---|
| `src/main/` | Node.js main process — IPC, PTY, hooks server, config |
| `src/preload/` | contextBridge — typed API surface |
| `src/renderer/components/` | Feature folders: Layout, Terminal, FileTree, FileViewer, AgentMonitor, CommandPalette, Settings |
| `src/renderer/hooks/` | Shared hooks: useConfig, useTheme, usePty, useAgentEvents, useFileWatcher |
| `src/renderer/contexts/` | React contexts: ProjectContext |
| `src/renderer/themes/` | Theme definitions (retro, modern, warp, cursor, kiro) |
| `src/renderer/types/` | `electron.d.ts` — full IPC type contract |

## Codebase Graph (codebase-memory MCP)

The repo is indexed in the codebase-memory graph (1.4K nodes, 2.3K edges). Auto-sync keeps it fresh.

**Use graph tools first for orientation and multi-file tasks:**
- `search_graph` — find functions/classes/modules by name pattern (cheaper than Grep for symbol lookup)
- `trace_call_path` — who calls a function, what it calls (use before refactoring to understand blast radius)
- `get_code_snippet` — retrieve source + metadata for a known symbol (cheaper than Read for targeted lookup)
- `query_graph` — Cypher queries for relationship patterns (e.g. find all callers of a module)
- `detect_changes` — map uncommitted changes to affected symbols + blast radius
- `get_architecture` — structural overview (use `aspects` param to limit output: `['hotspots']`, `['file_tree']`, etc.)

**Fall back to Grep/Read** for single-file tasks, string literals, or when you already know the exact file path.

## Task-Type Skip List

Only load docs relevant to your task. Saves tokens and avoids confusion.

| Working on... | Read | Skip |
|---|---|---|
| Terminal (xterm, PTY, shell) | Terminal Gotchas below, `docs/api-contract.md` (PTY API) | FileViewer, AgentMonitor sections |
| File viewer / tree | `docs/api-contract.md` (Files API) | Terminal Gotchas, AgentMonitor sections |
| Agent monitor (hooks, events) | `docs/api-contract.md` (Hooks API), `docs/data-model.md` | Terminal Gotchas, FileViewer sections |
| Layout / panels / theming | `docs/architecture.md` (component tree, layout system) | `docs/api-contract.md`, `docs/data-model.md` |
| IPC / preload / main process | `docs/architecture.md`, `docs/api-contract.md`, `docs/data-model.md` | Frontend component sections |
| New feature (any) | `docs/architecture.md` (full), this file (full) | Nothing — read everything |

## Key Conventions

### IPC Contract
- Channel naming: `domain:action` (e.g. `pty:spawn`, `files:readDir`, `config:set`)
- Handlers return `{ success: boolean; error?: string }` pattern
- Event listeners return cleanup functions (not disposables)
- Full channel reference: `docs/api-contract.md`

### Two Event Systems — Don't Confuse Them
1. **Electron IPC** — `ipcRenderer.on` / `ipcMain.handle` via preload bridge (`menu:new-terminal`, `pty:data:${id}`)
2. **DOM CustomEvents** — `window.dispatchEvent` / `window.addEventListener` (`agent-ide:new-terminal`, `agent-ide:set-theme`, `agent-ide:open-settings`)

Never mix these. IPC events flow through preload. DOM events are renderer-only.

### Styling
- Tailwind utilities + CSS custom properties — never hardcode colors
- Theme vars: `var(--bg)`, `var(--text)`, `var(--accent)`, `var(--border)`, `var(--font-ui)`, `var(--font-mono)`
- Terminal vars: `var(--term-bg)`, `var(--term-fg)`, `var(--term-cursor)`, `var(--term-selection)`

## Terminal Gotchas
Hard-won lessons — not documented elsewhere:
- Package: `@xterm/xterm` (NOT legacy `xterm` — they are incompatible)
- Addons: `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links`
- **No WebGL addon** — `@xterm/addon-webgl` causes ghost cursor artifacts during rapid output. Canvas renderer is used instead.
- xterm needs **double-rAF** after `term.open()` before calling `fit()` — viewport isn't ready until then
- Use `isReadyRef` guard pattern to prevent premature fit calls
- OSC 10/11/12 blocked via `term.parser.registerOscHandler` to prevent programs from overriding theme colors

## Known Issues / Tech Debt
- TerminalPane and TerminalManager both render tab bars (double header) — needs state lifting to unify
- `files:watchDir` is registered but never called from renderer — dirty-on-disk detection is passive only
- Settings modal in App.tsx is inline — should use the Settings components in `components/Settings/`
- `menu:settings` event sent from menu.ts but App.tsx listens for `agent-ide:open-settings` DOM event instead

## Project Context
- `ai/vision.md` — Product vision, design north stars
- `ai/deferred.md` — Remaining unimplemented features, prioritized by area
- `docs/architecture.md` — Full architecture, component tree, state management, ownership rules, security model
- `docs/api-contract.md` — Complete IPC channel reference, file operations, PTY API
- `docs/data-model.md` — Config schema, state types, event types
