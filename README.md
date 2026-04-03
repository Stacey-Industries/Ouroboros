# Ouroboros IDE

A desktop IDE purpose-built for working with AI coding agents. Wraps Claude Code and Codex CLI sessions in a full development environment — file tree, Monaco editor, terminal multiplexer, real-time agent monitoring, and an orchestration layer that automatically prepares project context before the agent sees your prompt.

Built with Electron 41, React 19, TypeScript, and Monaco Editor. Runs on Windows, macOS, and Linux.

This project is developed from within itself. Claude Code runs as a terminal session inside Ouroboros — editing the source code of the app it's running in. The snake eats its own tail.

![Screenshot](docs/assets/screenshot.png)

## What it does

Ouroboros sits between you and your AI coding agent. Instead of a bare terminal, you get:

**Agent Chat** — A threaded conversation interface backed by Claude Code's `--output-format stream-json` mode. Messages stream in real-time with syntax-highlighted code blocks, collapsible tool call groups, thinking blocks, and inline diff apply. Conversations persist to SQLite, support branching (fork from any message), and include git snapshot capture so you can revert the workspace to its state before any agent turn.

**Context Orchestration** — Before your prompt reaches the agent, the orchestration layer scores and ranks every file in the project using 10+ signals (user selection, git diff, diagnostics, import adjacency, edit recency, keyword match, etc.), extracts relevant snippets within a token budget, and injects them as structured XML context. A background worker thread refreshes this packet every 30 seconds so it's ready before you hit send.

**Terminal Management** — Multiple xterm.js sessions with WebGL rendering, shell integration (OSC 633/133), Warp-style command blocks, CodeMirror rich input, tab completions, history search, split panes, and session recording (asciicast v2). Terminal output is ring-buffered and available to the context layer.

**File Explorer & Editor** — Virtual-scrolling file tree with git status indicators, inline rename, bookmarks, file nesting, and diagnostic overlays. Monaco editor with vim mode, diff view, symbol outline, blame annotations, and LSP support (TypeScript, Python, Go, etc. via configurable language servers).

**Agent Monitor** — Real-time dashboard showing active agent sessions, tool call feeds, Gantt-style timelines, cost tracking with daily charts, and parent/child subagent trees. Sessions are identified and tracked through the hooks pipeline.

**Hooks & Approval** — A named-pipe server (`\\.\pipe\agent-ide-hooks` on Windows, TCP on other platforms) that receives NDJSON events from Claude Code hook scripts. Tool calls can be intercepted before execution — the approval system routes `pre_tool_use` events to a keyboard-driven dialog (Y/N/A/Esc) and writes response files that the hook scripts poll.

**Web Remote Access** — An Express + WebSocket server on port 7890 that serves the same React UI to any browser. IPC calls are bridged through JSON-RPC 2.0, PTY data is batched at 16ms intervals to avoid per-byte WebSocket frames, and auth uses time-safe token comparison with rate limiting (10 failures per IP per 15-minute window).

**Theming** — Seven built-in themes (modern dark, retro CRT with scanlines, light, high-contrast, plus Warp/Cursor/Kiro-inspired variants), a custom theme editor with live CSS variable overrides, and extension theme support from installed VS Code themes.

## Architecture

Three-process Electron architecture with strict context isolation:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                             │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │ PTY Mgr  │  │ Hooks    │  │ IDE Tool  │  │ Agent Chat        │  │
│  │ (node-pty│  │ Server   │  │ Server    │  │ Service           │  │
│  │ sessions)│  │ (named   │  │ (reverse  │  │ (bridge +         │  │
│  │          │  │  pipe /  │  │  channel  │  │  thread store +   │  │
│  │          │  │  TCP)    │  │  for tool │  │  orchestration)   │  │
│  │          │  │          │  │  queries) │  │                   │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └────────┬──────────┘  │
│       │              │              │                  │             │
│  ┌────┴──────────────┴──────────────┴──────────────────┴──────────┐  │
│  │  IPC Handler Registry (ipc.ts — 20+ domain registrars)        │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │  Web Server (Express + WS, port 7890)                         │  │
│  │  JSON-RPC 2.0 bridge to same IPC handlers                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ contextBridge
┌──────────────────────────────────┴──────────────────────────────────┐
│  Preload (contextBridge)                                            │
│  window.electronAPI — 30+ typed namespaces, ~200 methods            │
│  No raw ipcRenderer exposed. Event subscriptions return cleanup fns │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────┴──────────────────────────────────┐
│  Renderer (React 19)                                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Slot-based AppLayout (no business logic in the shell)      │    │
│  │                                                             │    │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐  │    │
│  │  │ Sidebar  │ │ Centre   │ │ Terminal  │ │ Agent Monitor│  │    │
│  │  │ (FileTree│ │ (Monaco  │ │ (xterm.js │ │ (session     │  │    │
│  │  │  Git     │ │  Diff    │ │  WebGL    │ │  cards, cost │  │    │
│  │  │  Search) │ │  Preview │ │  CodeMir  │ │  timeline)   │  │    │
│  │  │          │ │  Blame)  │ │  Blocks)  │ │              │  │    │
│  │  └──────────┘ └──────────┘ └───────────┘ └──────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Two event systems (never mixed):                                   │
│    Electron IPC — cross-process via window.electronAPI              │
│    DOM CustomEvents — renderer-only (agent-ide:* namespace)         │
└─────────────────────────────────────────────────────────────────────┘
```

### How context orchestration works

When you send a message through Agent Chat:

1. The orchestration layer captures the current `git rev-parse HEAD` (for later revert)
2. `contextSelector` scores every file in the workspace — pinned files get 100 points, git-dirty files get 56, files with diagnostics get 52, import-adjacent files get 22+, and so on across 10+ signal types
3. `contextPacketBuilder` extracts relevant line ranges from top-ranked files, enforces a model-specific token budget (128KB for Opus, 72KB for Sonnet, 48KB default), and deduplicates overlapping ranges
4. The packet is serialized as XML context blocks and prepended to your message
5. `claudeStreamJsonRunner` spawns `claude -p --output-format stream-json`, pipes the enriched prompt via stdin, and parses the NDJSON response line by line
6. Stream events are diffed (Claude emits full message snapshots; the event handler diffs them into per-block deltas) and forwarded to the renderer as typed `AgentChatStreamChunk`s

A background worker thread keeps a warm context packet ready every 30 seconds, so step 2-4 is near-instant when you actually send.

### How the hooks pipeline works

Claude Code supports [user-defined hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) — shell scripts that run at lifecycle points (session start/stop, before/after tool use). Ouroboros installs hook scripts to `~/.claude/hooks/` that forward events over a named pipe.

The flow:

1. Claude Code fires a hook (e.g., `pre_tool_use` for a file write)
2. The hook script sends an NDJSON payload over the named pipe to the hooks server
3. `hooks.ts` routes the event: lifecycle events update session tracking, `pre_tool_use` with a `requestId` goes to the approval manager
4. The approval manager notifies all renderers + web clients via IPC, flashes the Windows taskbar, and optionally auto-approves after a configurable timeout
5. The hook script polls `~/.ouroboros/approvals/{requestId}.response` at 500ms intervals until the response file appears
6. The response (allow/deny) is written by the approval manager when the user presses Y/N in the dialog

During active Agent Chat sessions, real hook events from CLI terminal sessions are suppressed in the renderer (the chat bridge emits its own synthetic events instead) to prevent UI interference between concurrent sessions.

## Project structure

```
src/
  main/                    # Electron main process (Node.js)
    agentChat/             # Chat service, thread store (SQLite), orchestration bridge,
                           #   streaming, git snapshots, session memory, conversation compaction
    orchestration/         # Context preparation — repo indexer, file scorer, packet builder,
                           #   30s background worker, provider adapters (Claude Code, Codex, API)
    ipc-handlers/          # 20+ domain handler registrars (pty, files, git, config, auth, mcp,
                           #   extensions, sessions, agent chat, search, AI, misc)
    web/                   # Express HTTP + WebSocket server, JSON-RPC bridge, PTY batcher,
                           #   handler registry capture, token auth
    pty*.ts                # PTY session management, Claude/Codex spawners, env construction,
                           #   output buffer (200-line ring per session), asciicast recording
    hooks*.ts              # Named pipe/TCP NDJSON server, event dispatcher, session tracking,
                           #   hook script installer (SHA-256 versioned)
    approvalManager.ts     # Tool-use approval — response-file protocol, auto-approve timer
    ideToolServer.ts       # Reverse channel — agents can query IDE state (open files, git, etc.)
    config*.ts             # electron-store with 60+ typed settings, split across 3 schema files

  preload/                 # contextBridge — typed window.electronAPI
    preload.ts             # 30+ API namespaces, ~200 methods, zero raw ipcRenderer exposure
    preloadSupplementalApis.ts

  renderer/                # React 19 browser process
    components/
      Layout/              # Slot-driven 5-panel shell (sidebar, centre, terminal, agent, status)
      AgentChat/           # Threaded chat UI — streaming, tool groups, code blocks, diff apply
      AgentMonitor/        # Session cards, tool feed, cost dashboard, Gantt timeline
      Terminal/            # xterm.js WebGL + shell integration + command blocks + split panes
      FileTree/            # Virtual-scrolling tree, git status, Zustand store, inline ops
      FileViewer/          # Monaco editor, diff, blame, PDF/image/hex viewers, LSP integration
      GitPanel/            # Branch selector, staged/unstaged diffs, AI commit message generation
      CommandPalette/      # Fuzzy command search + file picker + symbol search
      Settings/            # Tabbed modal (18 sections), theme editor, profile management
      DiffReview/          # Per-hunk accept/reject with optimistic staging
      ExtensionStore/      # Open VSX + VS Code Marketplace browser/installer
      McpStore/            # MCP server registry browser/installer
      Orchestration/       # Task composer, context metrics, verification summary
      MultiSession/        # Parallel agent launcher (up to 4 concurrent sessions)
      TimeTravel/          # Workspace snapshot timeline with git-based restore
      SessionReplay/       # DVR-style playback of completed agent sessions
      Analytics/           # Aggregate session metrics, tool distribution, cost charts
      primitives/          # Design system atoms (Button, Badge, Card, Surface, Menu, etc.)
      shared/              # ErrorBoundary, Toast, Tooltip, NotificationCenter, Skeleton
    hooks/                 # 30+ shared hooks (config, theme, agent events, terminal, git,
                           #   file watcher, command registry, cost tracking, performance, etc.)
    contexts/              # ProjectContext, AgentEventsContext, ApprovalContext, FocusContext, ToastContext
    themes/                # 7 built-in themes + custom theme + extension theme registry
    types/                 # IPC type contract split across 10 declaration files
    styles/                # CSS custom properties (semantic tokens), Tailwind base

  shared/                  # Cross-process code (no Node/Electron/browser deps)
    ipc/                   # Channel constant definitions (agent chat, orchestration)
    types/                 # Shared type definitions (auth, orchestration, agent chat, pricing)

  web/                     # Browser deployment shim
    webPreload.ts          # WebSocket JSON-RPC transport → same window.electronAPI surface
    webPreloadTransport.ts # Reconnecting WS client with binary deserialization
```

## Prerequisites

- **Node.js** >= 20
- **npm** >= 9
- **Git**
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code` (for agent features)

## Quick start

```bash
git clone https://github.com/colesam/agent-ide.git
cd agent-ide
npm install        # also runs electron-rebuild for node-pty and better-sqlite3
npm run dev        # starts dev server + Electron with hot-reload
```

The renderer hot-reloads via Vite HMR. Main process changes require a restart.

## Build & package

```bash
npm run build          # Production build (electron-vite, 3 targets)
npm run dist           # Build + package (NSIS on Windows, DMG on Mac, AppImage on Linux)
npm run build:web      # Web deployment — renderer + WebSocket preload shim to out/web/
```

Web build ordering matters: `vite.web.config.ts` runs first (renderer), then `vite.webpreload.config.ts` (IIFE shim with `emptyOutDir: false` to preserve the renderer output).

Bundle analysis: `ANALYZE=true npm run build` outputs interactive treemaps to `stats/`.

## Development

```bash
npm run dev              # Dev server + Electron with hot-reload
npm run typecheck        # TypeScript (checks both renderer and node tsconfigs)
npm run lint             # ESLint (enforces max-lines:300, max-lines-per-function:40,
                         #   complexity:10, max-depth:3, max-params:4, security rules on main)
npm test                 # Vitest unit tests (~54 test files)
npm run test:e2e         # Playwright E2E (app launch, layout, agent chat smoke)
npm run validate         # typecheck + format + lint + test (full CI gate)
npm run rebuild:native   # Rebuild native modules (node-pty, better-sqlite3) for Electron
```

## Configuration

Ouroboros stores settings via `electron-store` with a typed JSON schema (60+ keys). Settings are accessible through the Settings modal (18 tabbed sections) or the config file directly.

Notable settings:

| Setting | Description |
|---------|-------------|
| `claudeCliSettings` | Claude Code CLI flags — model, permission mode, effort, budget, allowed/disallowed tools, additional directories, worktree mode |
| `codexCliSettings` | Codex CLI flags — model, reasoning effort, sandbox mode, approval policy |
| `modelSlots` | Per-feature model assignment (terminal, agent chat, CLAUDE.md generation, inline completion) |
| `modelProviders` | Custom model provider configs (base URL, API key, model list) |
| `approvalRequired` | Tool names that require manual approval before execution |
| `approvalTimeout` | Seconds before auto-approving (0 = always manual) |
| `contextLayer` | Context layer config — max modules, max size, debounce, auto-summarize, depth |
| `lspEnabled` / `lspServers` | Language server protocol support per language |
| `webAccessPort` / `webAccessPassword` | Web remote access server configuration |
| `workspaceLayouts` | Named panel layout presets (3 built-in: Default, Monitoring, Review) |
| `agentTemplates` | Agent task templates (5 built-in: Review PR, Write Tests, Explain, Refactor, Fix Build) |

## Key dependencies

| Category | Package | Role |
|----------|---------|------|
| Runtime | Electron 41, React 19 | Desktop shell, UI framework |
| Editor | Monaco Editor 0.55, full CodeMirror 6 | Primary editor, terminal rich input |
| Terminal | @xterm/xterm 6 + 8 addons, node-pty 1.2-beta | Terminal emulation, PTY management |
| Storage | better-sqlite3 12, electron-store 8 | Thread persistence, app config |
| AI | @anthropic-ai/sdk 0.80 | Direct API access (non-CLI path) |
| Web | Express 5, ws 8 | Remote access server |
| Search | Fuse.js 7, web-tree-sitter 0.22, shiki 3 | Fuzzy search, parsing, syntax highlighting |
| State | Zustand 5, immer 11 | Selective state management (file tree) |
| LSP | vscode-jsonrpc 8, vscode-languageserver-protocol 3 | Language server support |

## Documentation

Detailed docs live in `docs/`:

- [`architecture.md`](docs/architecture.md) — Full architecture reference: process model, component tree, state management patterns, data flow diagrams, security model
- [`api-contract.md`](docs/api-contract.md) — Complete IPC channel reference with directions, payloads, and return types
- [`data-model.md`](docs/data-model.md) — Config schema and persisted state types
- [`authentication.md`](docs/authentication.md) — Auth providers (GitHub OAuth, Anthropic API key, CLI credential import), credential storage, token refresh
- [`web-remote-access.md`](docs/web-remote-access.md) — Web server setup, auth, Tailscale/Cloudflare Tunnel access, mobile usage
- [`guides/complete-beginners-guide.md`](docs/guides/complete-beginners-guide.md) — 26-section walkthrough of every panel and feature

Each subsystem directory may also contain its own `CLAUDE.md` with architecture details and gotchas specific to that area.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, coding standards, and workflow guidelines.

## License

[MIT](LICENSE)
