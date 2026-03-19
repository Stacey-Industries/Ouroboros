<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
This root directory has **three separate Vite build pipelines** for the same React app: `electron.vite.config.ts` (Electron), `vite.web.config.ts` (browser), and `vite.webpreload.config.ts` (IIFE shim). The IIFE format for `webPreload.ts` is intentional — it needs to execute synchronously before React bootstraps, so it can't be an ES module. The `emptyOutDir: false` in the webpreload config is a critical ordering constraint: the renderer must build first, then the preload is injected into the same `out/web/` directory.
`─────────────────────────────────────────────────`

# Root — Build Configuration & Tooling

Build pipeline and tooling config for an Electron desktop IDE. Three build targets (main/preload/renderer) plus an optional web deployment mode.

## Key Files

| File                        | Role                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron.vite.config.ts`   | Primary build — three targets: `main` (Node), `preload` (Node), `renderer` (React + Monaco). Run with `npm run build`.                                                                                               |
| `vite.web.config.ts`        | Web deployment build — same React renderer served over HTTP. Outputs to `out/web/`. Injects `webPreload.js` via `transformIndexHtml` and moves `index.html` from `out/web/src/web/` to `out/web/` via `closeBundle`. |
| `vite.webpreload.config.ts` | Builds `src/web/webPreload.ts` as IIFE — provides `window.electronAPI` over WebSocket for web mode. Must run **after** `vite.web.config.ts`. Uses `emptyOutDir: false` to preserve the renderer build.               |
| `tailwind.config.ts`        | Design token system — `surface/*` (backgrounds), `accent/*` (semantic), `ink/*` (text hierarchy). Only scans `src/renderer/`.                                                                                        |
| `knip.config.ts`            | Dead code detection. Entry points: `main.ts`, `preload.ts`, `preloadSupplementalApis.ts`, `index.tsx`. `src/renderer/types/**` excluded (declaration files only).                                                    |
| `vitest.config.ts`          | Unit tests — Node env, `src/**/*.test.ts`, V8 coverage. Thresholds at 5% (intentionally low — ratchet up over time).                                                                                                 |
| `postcss.config.js`         | Tailwind + Autoprefixer only. No custom transforms.                                                                                                                                                                  |

## Build Targets

```
electron.vite.config.ts
  ├── main     → src/main/main.ts          (Node.js, deps externalized)
  ├── preload  → src/preload/preload.ts    (Node.js, isolated renderer context)
  └── renderer → src/renderer/index.html  (Browser, React, Monaco workers, Tailwind)

vite.web.config.ts      → out/web/           (browser deployment)
vite.webpreload.config.ts → out/web/webPreload.js (IIFE shim, builds last)
```

## Path Aliases

| Alias         | Resolves to      | Available in  |
| ------------- | ---------------- | ------------- |
| `@main/*`     | `src/main/*`     | main, preload |
| `@preload/*`  | `src/preload/*`  | preload       |
| `@renderer/*` | `src/renderer/*` | renderer, web |
| `@shared/*`   | `src/shared/*`   | all targets   |

## Design Token System

Three-tier color naming — use Tailwind utilities, never raw hex:

- **`surface-*`**: `DEFAULT` (#0d1117) → `raised` → `overlay` → `border`
- **`accent-*`**: `blue`, `green`, `orange`, `red`, `purple` + `-muted` variants
- **`ink-*`**: `DEFAULT` → `muted` → `faint` → `inverse`

Runtime theming uses CSS custom properties (`var(--bg)`, `var(--accent)`, etc.) — see `src/renderer/themes/`.

## Monaco Workers

The renderer bundles 5 Monaco language workers: `editorWorkerService`, `typescript`, `json`, `css`, `html`. Workers output to `out/renderer/monacoeditorwork/` (Electron) or `out/web/monacoeditorwork/` (web).

## Gotchas

- **Monaco plugin CJS/ESM interop**: `vite-plugin-monaco-editor` exports a CJS default — the config wraps it with `.default ?? module`. Do not simplify this.
- **`optimizeDeps.force: true` in dev**: Forces Vite dep re-scan on cold starts. Prevents stale hash mismatches after `npm install` while dev server is down. Set to `false` in production.
- **Web build ordering matters**: Run `vite.web.config.ts` first, then `vite.webpreload.config.ts`. The preload uses `emptyOutDir: false` to preserve the renderer output.
- **`index.html` relocation**: Vite places the web build's HTML at `out/web/src/web/index.html` due to project-relative path resolution. The `moveHtmlToRoot` plugin fixes this in `closeBundle`.
- **Tailwind only scans `src/renderer/`**: Classes used in main or preload code won't appear in the CSS bundle.
- **`src/renderer/types/**`excluded from knip**: These are`.d.ts` declaration files — knip can't analyze them as entry consumers.

## Bundle Analysis

```bash
ANALYZE=true npm run build
```

Outputs `stats/main.html`, `stats/preload.html`, `stats/renderer.html` via `rollup-plugin-visualizer`.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

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

### Folder Map

| Path                       | Contents                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/main/`                | Node.js main process — IPC, PTY, hooks server, config                                           |
| `src/preload/`             | contextBridge — typed API surface                                                               |
| `src/renderer/components/` | Feature folders: Layout, Terminal, FileTree, FileViewer, AgentMonitor, CommandPalette, Settings |
| `src/renderer/hooks/`      | Shared hooks: useConfig, useTheme, usePty, useAgentEvents, useFileWatcher                       |
| `src/renderer/contexts/`   | React contexts: ProjectContext                                                                  |
| `src/renderer/themes/`     | Theme definitions (retro, modern, warp, cursor, kiro)                                           |
| `src/renderer/types/`      | `electron.d.ts` — full IPC type contract                                                        |

## Codebase Graph (codebase-memory MCP)

The repo is indexed in the codebase-memory graph (1.4K nodes, 2.3K edges). Auto-sync keeps it fresh.

### When to use Graph tools vs Grep/Read

**MUST use graph tools — these tasks are significantly faster and more accurate with the graph:**

| Task                                      | Tool                                    | Why not Grep/Read                                                                                                               |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Before refactoring a function**         | `trace_call_path`                       | Grep finds string matches; the graph finds actual callers across the dependency chain. Prevents breaking unknown consumers.     |
| **Debugging a crash across components**   | `detect_changes` + `trace_call_path`    | Maps dirty files → affected symbols → blast radius with risk levels. Would have saved hours on the HMR/chat crash (2026-03).    |
| **Finding where a symbol is defined**     | `search_graph`                          | Returns the exact file + line + metadata. Grep returns every file containing the string, including comments and variable names. |
| **Understanding a module before editing** | `get_architecture aspects=['hotspots']` | Shows most-connected functions — the ones where a change has the widest impact.                                                 |
| **Impact analysis before a PR**           | `detect_changes scope='branch'`         | Topology-based risk classification (CRITICAL → LOW) for every affected caller.                                                  |

**Use Grep/Read instead — graph adds overhead for these:**

| Task                                          | Tool            | Why                                                         |
| --------------------------------------------- | --------------- | ----------------------------------------------------------- |
| Read a specific file you already know         | `Read`          | Direct I/O, no graph query needed                           |
| Find a string literal or error message        | `Grep`          | Text search; the graph indexes symbols, not string literals |
| Find files by name pattern                    | `Glob`          | File-system glob, not a symbol query                        |
| Single-file edits with no cross-module impact | `Read` → `Edit` | No blast radius to assess                                   |

### Graph tool reference

- `search_graph` — find functions/classes/modules by name pattern
- `trace_call_path` — who calls a function, what it calls
- `get_code_snippet` — retrieve source + metadata for a known symbol
- `query_graph` — Cypher queries for relationship patterns (e.g. find all callers of a module)
- `detect_changes` — map uncommitted changes to affected symbols + blast radius
- `get_architecture` — structural overview (use `aspects` param to limit output: `['hotspots']`, `['file_tree']`, etc.)

## Task-Type Skip List

Only load docs relevant to your task. Saves tokens and avoids confusion.

| Working on...                 | Read                                                                 | Skip                                         |
| ----------------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| Terminal (xterm, PTY, shell)  | Terminal Gotchas below, `docs/api-contract.md` (PTY API)             | FileViewer, AgentMonitor sections            |
| File viewer / tree            | `docs/api-contract.md` (Files API)                                   | Terminal Gotchas, AgentMonitor sections      |
| Agent monitor (hooks, events) | `docs/api-contract.md` (Hooks API), `docs/data-model.md`             | Terminal Gotchas, FileViewer sections        |
| Layout / panels / theming     | `docs/architecture.md` (component tree, layout system)               | `docs/api-contract.md`, `docs/data-model.md` |
| IPC / preload / main process  | `docs/architecture.md`, `docs/api-contract.md`, `docs/data-model.md` | Frontend component sections                  |
| New feature (any)             | `docs/architecture.md` (full), this file (full)                      | Nothing — read everything                    |

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
- Settings modal in App.tsx is inline — should use the Settings components in `components/Settings/`

## Project Context

- `ai/vision.md` — Product vision, design north stars
- `ai/deferred.md` — Remaining unimplemented features, prioritized by area
- `docs/architecture.md` — Full architecture, component tree, state management, ownership rules, security model
- `docs/api-contract.md` — Complete IPC channel reference, file operations, PTY API
- `docs/data-model.md` — Config schema, state types, event types

## Key Files

| File           | Role        |
| -------------- | ----------- |
| `src/main.ts`  | Entry point |
| `src/index.ts` | Public API  |

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm test` — run tests
