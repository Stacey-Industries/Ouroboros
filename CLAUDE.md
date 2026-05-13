# Ouroboros — Claude Code Instructions

Agent-first Electron desktop IDE for launching/monitoring Claude Code sessions. Three-process architecture (main → preload → renderer) with strict context isolation.

## Build / reload notes

- `npm run dev` — spawns an Electron dev instance with Vite HMR for the renderer; main-process changes require restarting the dev instance.
- `npm run build` — produces `out/`. Anything that loads from `out/` (notably the codemode proxy's `ouroboros` MCP server defined in `~/AppData/Local/Temp/codemode-proxy-config.json`) keeps using the previously-loaded code in memory. To pick up rebuilt code, restart whatever forked the subprocess (e.g., the Claude Code session that spawned the MCP server).
- `npm run dist` — builds + packages with electron-builder for distribution.

## Gotcha maintenance rule

When you discover a non-obvious constraint, surprise behavior, or load-bearing pattern during work, you MUST append a line to the nearest subsystem `CLAUDE.md`'s `## Gotchas` section before completing the task. Do this in the same commit as the fix or change that revealed the gotcha.

Format: `- **<topic>**: <rule>. Reason: <why>.`

Examples of what counts: a flag that must be set in a specific order, a state machine transition that looks redundant but isn't, an import that must use a specific path for a non-obvious build reason, a workaround for a third-party bug.

If the discovery doesn't fit any existing CLAUDE.md, add it to the most directly affected subsystem's CLAUDE.md or, if truly cross-cutting, to this root CLAUDE.md.

## Commands

- `npm run dev` — start dev server + Electron (hot-reload renderer)
- `npm run build` — production build (electron-vite)
- `npm run dist` — build + package with electron-builder
- `npm test` — run the full vitest suite (~5 min, agent-unfriendly — prefer scoped scripts below)
- `npm run test:watch` — vitest in watch mode

### Scoped vitest scripts — agents should prefer these

The full suite consistently exceeds agent timeouts (~280-400s). After touching files in a subsystem, run the matching scoped script — each finishes in 30-120s. Composition: scoped runs are NOT mutually exhaustive (e.g. `test:agentchat` is a subset of `test:renderer`), pick the smallest one that covers your change.

| Script | Path scope | Use when you touched |
|---|---|---|
| `test:main` | `src/main` | Electron main process, IPC handlers, native deps |
| `test:renderer` | `src/renderer` | React UI (large — prefer narrower) |
| `test:agentchat` | `src/renderer/components/AgentChat` | Chat composer, conversation, mentions, slash menu |
| `test:lexical` | `…/AgentChat/lexicalComposer` | Lexical composer plugins / bridge |
| `test:layout` | `src/renderer/components/Layout` | App shell, panes, title bar, workbench |
| `test:filetree` | `src/renderer/components/FileTree` | File tree |
| `test:codebasegraph` | `src/main/codebaseGraph` | Graph indexer / queries |
| `test:orchestration` | `src/main/orchestration` | Orchestration runtime |
| `test:ipc` | `src/main/ipc-handlers` | IPC handler implementations |
| `test:hooks` | `src/main/hookInstaller`, `src/main/hooks` | Hook installer / named pipe server |
| `test:preload` | `src/preload` | contextBridge surface |
| `test:web` | `src/web` | Web stub layer (mobile / capacitor) |
| `test:shared` | `src/shared` | Shared types / pure helpers |
| `test:tools` | `tools`, `scripts` | Build / analysis tooling |

Full suite + lint + typecheck still runs at commit/wave-end. Scoped runs are for the implementation loop.

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
| `src/renderer/themes/`     | Theme definitions (retro, modern, warp, cursor, kiro, material, light, high-contrast)           |
| `src/renderer/types/`      | `electron.d.ts` — full IPC type contract                                                        |

Each subdirectory has its own `CLAUDE.md` with a subsystem-specific file map.

## Codebase Graph — use it FIRST

The repo is indexed in the codebase-memory graph (~18.3K nodes, ~13.2K edges, auto-synced on file changes). At this graph size queries are moderately cheap; use them routinely for symbol queries.

**Default behavior for symbol queries: graph tools FIRST, Grep is the fallback.** When the question is "who calls X", "where is X defined", "what's the body of X", "what depends on X" — use `trace_call_path`, `search_graph`, `get_code_snippet`, `detect_changes`, or `query_graph` (Cypher) BEFORE reaching for Grep. Grep returns text matches including comments and same-name unrelated occurrences; the graph returns actual structural edges.

If you find yourself running a Grep for an identifier and following it with three Reads to disambiguate, you skipped the graph. See `~/.claude/rules/graph-tool-routing.md` for the full prescriptive table.

Codemode is enabled in this project — graph tools surface as `servers.ouroboros.*` inside `execute_code` (the codemode proxy's single tool). Example: `await servers.ouroboros.trace_call_path({ symbol: 'parseConfig', direction: 'callers' })`.

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
- `docs/codemode-internalmcp-routing.md` — CodeMode routing for internalMcp, configuration, telemetry, rollback (Wave 51)
- `docs/claude-md-lifecycle.md` — CLAUDE.md generation, grooming, and organic growth
- `docs/hook-migration.md` — rule-to-hook conversion, rollback, and escalation
- `docs/telemetry-parity.md` — telemetry parity architecture and migration recipe
- `docs/context-ranker.md` — context ranker, weight modes, hit-rate telemetry
- `ai/vision.md` — Product vision, design north stars
- `ai/deferred.md` — Remaining unimplemented features, prioritized by area

## Rules, Hooks, and Commands

Context-specific rules are in `.claude/rules/` (injected automatically by glob match). Hooks enforce constraints deterministically via `.claude/settings.json`. Slash commands are in `.claude/commands/` (project) and `~/.claude/commands/` (global).

**UI-bearing changes require a signed manual smoke entry** — any wave touching `src/renderer/components/Layout/**` must include a completed smoke checklist in its result brief before push. See `~/.claude/rules/manual-smoke-gate.md` for the rule and `roadmap/session-handoff.md` for the checklist template.

**Global pipeline rule:** `~/.claude/rules/development-pipeline.md` — three-lane (Build/Fix/Orient) pipeline. This repo's `roadmap/` aligns with its taxonomy (`follow-ups/`, `deferred/`, `bugs/`, `decisions/`).

**Dispatch reflex** (added 2026-05-12): before 3+ exploration calls (Read/Grep/Glob) on the same question or continuing debug past one failed fix, DISPATCH from the catalog (`haiku-explorer`, `sonnet-explorer`, `sonnet-diagnostician`, `haiku-implementer`, etc. — see `~/.claude/rules/agent-catalog.md`). Hooks `~/.claude/hooks/dispatch_reflex_nudge.mjs` and `~/.claude/hooks/fresh_session_reminder.mjs` provide nudges. Fresh-session suggestions below 60% context utilization are usually wrong — hard work below threshold = dispatch a subagent, not session reset.
