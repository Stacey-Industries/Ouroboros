# Architecture

## Three-Process Model

Ouroboros follows Electron's standard three-process architecture with strict isolation:

```
┌──────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                 │
│  main.ts → Window creation, lifecycle, security          │
│  ipc.ts  → IPC orchestration (delegates to ipc-handlers/)│
│  pty.ts  → node-pty session management                   │
│  hooks.ts → Named pipe / TCP server for Claude events    │
│  config.ts → electron-store persistence                  │
│  hookInstaller.ts → Auto-install Claude Code hooks       │
│  approvalManager.ts → Pre-execution approval flow        │
│  agentChat/ → Chat threads, orchestration bridge         │
│  contextLayer/ → Repo-aware context enrichment           │
│  orchestration/ → Context prep, provider coordination    │
│  storage/ → SQLite database layer                        │
│  web/ → HTTP + WebSocket server for web access           │
└──────────────────┬───────────────────────────────────────┘
                   │ contextBridge (IPC)
┌──────────────────┴───────────────────────────────────────┐
│              Preload (preload.ts)                         │
│  Exposes window.electronAPI with typed wrappers           │
│  Maps ipcRenderer.invoke/on → domain-grouped API          │
│  Returns cleanup functions for all event subscriptions    │
└──────────────────┬───────────────────────────────────────┘
                   │ window.electronAPI
┌──────────────────┴───────────────────────────────────────┐
│              Renderer (React + Tailwind)                  │
│  App.tsx → Three-layer bootstrap (config gate → providers │
│            → hook orchestration)                         │
│  Components → Feature folders with barrel exports        │
│  Hooks → useConfig, useTheme, usePty, useAgentEvents     │
│  Contexts → Project, FileViewer, AgentEvents, Approval   │
│  Themes → built-in + custom/extension themes (CSS vars)  │
└──────────────────────────────────────────────────────────┘
```

## Boot Sequence

```
1. main.ts
   ├─ requestSingleInstanceLock()
   ├─ createWindow() → BrowserWindow with preload
   ├─ buildApplicationMenu()
   ├─ registerIpcHandlers()
   ├─ startHooksServer()
   └─ installHooks()

2. preload.ts
   └─ contextBridge.exposeInMainWorld('electronAPI', { ... })

3. Renderer
   ├─ index.tsx → createRoot().render(<App />), splash fade-out
   ├─ App()                          # Config gate
   │   ├─ useTheme() → apply CSS vars to :root
   │   ├─ useConfig() → load config via IPC
   │   ├─ Show LoadingScreen while config loads
   │   └─ Render ConfiguredApp
   ├─ ConfiguredApp()                # Provider stack
   │   └─ ToastProvider > FocusProvider > AgentEventsProvider
   │       > ApprovalProvider > ProjectProvider → InnerApp
   └─ InnerApp()                     # Hook orchestration
       ├─ Call all top-level hooks (useTerminalSessions, useWorkspaceLayouts, ...)
       ├─ Build layout props via buildInnerAppLayoutProps()
       └─ Render <InnerAppLayout>
           └─ Providers (FileViewerManager, DiffReviewProvider, ...)
               └─ AppLayoutConnected → AppLayout (structural shell)
```

## Process Boundaries & Module Responsibilities

### Main Process — Each File Has One Job

| File / Directory     | Single Responsibility                                                    | Does NOT                            |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| `main.ts`            | App lifecycle, window creation, security setup                           | Handle IPC, manage PTY, serve hooks |
| `ipc.ts`             | Register/cleanup IPC handlers, delegate to domain modules                | Implement business logic directly   |
| `ipc-handlers/`      | Domain-split IPC handler registrars (files, git, config, sessions, etc.) | Cross-domain logic                  |
| `pty.ts`             | node-pty session CRUD, bridge data/exit to renderer                      | Read config, handle files           |
| `hooks.ts`           | Named pipe server, NDJSON parsing, event dispatch to renderer            | Manage PTY, read files              |
| `config.ts`          | electron-store read/write with schema validation                         | Handle IPC registration             |
| `hookInstaller.ts`   | Write/update hook scripts in ~/.claude/hooks/                            | Serve hooks, manage config          |
| `approvalManager.ts` | Pre-execution approval flow via response-file protocol                   | Serve hooks, manage PTY             |
| `agentChat/`         | Chat thread persistence, orchestration bridge, session projection        | Terminal management                 |
| `contextLayer/`      | Repo-aware context enrichment for agent sessions                         | Serve IPC directly                  |
| `orchestration/`     | Context preparation, provider coordination                               | UI/renderer interaction             |
| `codebaseGraph/`     | In-process codebase knowledge graph engine                               | IPC registration                    |
| `storage/`           | SQLite database layer and JSON→SQLite migration                          | Business logic                      |
| `web/`               | HTTP + WebSocket server for browser-based IDE access                     | Electron window management          |
| `backgroundJobs/`    | Headless `claude -p` job queue — SQLite-persisted, concurrency-capped    | Terminal/PTY management             |
| `agentConflict/`     | Cross-session symbol overlap detection via codebase graph                | IPC registration                    |

### Preload

Single file (`preload.ts`) that maps raw IPC channels to a typed API object:

- Groups by domain: `pty`, `config`, `files`, `hooks`, `app`, `theme`, `git`, `agentChat`, `sessions`, `lsp`, `extensions`, `mcp`, `claudeMd`, `contextLayer`, and more
- Wraps `ipcRenderer.on` into functions that return cleanup callbacks
- Never exposes `ipcRenderer` directly
- Full type contract in `src/renderer/types/` (split across `electron-*.d.ts` files, assembled in `electron-workspace.d.ts`)

### Renderer

React SPA with no Node.js access. All system interaction through `window.electronAPI`.

## Component Tree

```
App
├── useTheme()                        # Apply CSS vars to :root
├── useConfig()                       # Load persisted config
├── ConfiguredApp                     # Provider stack
│   ├── ToastProvider
│   ├── FocusProvider
│   ├── AgentEventsProvider
│   ├── ApprovalProvider
│   └── ProjectProvider               # Project root context
│       └── InnerApp                  # Hook orchestration layer
│           └── InnerAppLayout        # Wiring layer: providers + slot resolution
│               ├── FileViewerManager     # Context provider: open files, active tab
│               ├── MultiBufferManager    # Context provider: multi-buffer views
│               ├── DiffReviewProvider    # Context provider: diff state
│               └── AppLayoutConnected    # Reads FileViewer context for status bar
│                   └── AppLayout         # Structural shell: resize + collapse state
│                       ├── TitleBar              # Dropdown menus, notifications
│                       ├── ActivityBar           # VS Code-style 40px icon strip
│                       ├── Sidebar               # Left panel (file tree / search / git)
│                       │   └── SidebarSections
│                       │       ├── ProjectPicker       # Folder selector
│                       │       └── FileTree            # Virtualised file tree
│                       ├── CentrePane            # Editor area
│                       │   ├── EditorTabBar        # Open file tabs + split button
│                       │   └── EditorContent       # File viewer / multi-buffer
│                       │       └── FileViewer      # Syntax-highlighted (shiki)
│                       ├── AgentMonitorPane      # Right sidebar container
│                       │   └── RightSidebarTabs    # Chat-dominant with view switcher
│                       │       ├── AgentChatWorkspace    # Chat thread UI
│                       │       │   └── AgentConflictBanner   # Wave 6 — conflict warning
│                       │       ├── AgentMonitorManager   # Hook event aggregation
│                       │       │   ├── AgentCard[]
│                       │       │   ├── AgentEventLog
│                       │       │   ├── CostDashboard
│                       │       │   ├── ToolCallFeed
│                       │       │   └── BackgroundJobsPanel   # Wave 6 — bg job queue
│                       │       ├── GitPanel              # Staging area + branch ops
│                       │       └── AnalyticsDashboard    # Usage analytics (lazy)
│                       ├── TerminalPane          # Bottom panel
│                       │   └── TerminalManager
│                       │       ├── TerminalTabs
│                       │       └── TerminalInstance[]  # xterm.js instances
│                       └── StatusBar             # Branch, file info, LSP status
│           ├── CommandPalette                    # Fixed overlay
│           ├── SymbolSearch                      # Fixed overlay
│           ├── FilePicker                        # Fixed overlay
│           └── SettingsModal                     # Fixed overlay (full settings panel)
```

### Chat-Only Shell (Wave 42)

`ChatOnlyShell` is a second renderer shell that activates when `isChatWindow || immersiveFlag` is true in `InnerApp`. It replaces `InnerAppLayout` entirely at the renderer layer — the backend is unchanged (same session store, same threads, same PTY, same hooks pipe). The shell is a single-column layout: `ChatOnlyTitleBar` → `AgentChatWorkspace` (full-width, max-w-4xl centred) → `ChatOnlyStatusBar`, with an off-canvas `ChatOnlySessionDrawer` and a `ChatOnlyDiffOverlay` modal for batched diff review. Providers (`DiffReviewProvider`, `FileViewerManager`, `MultiBufferManager`) mount in `ChatOnlyShellWrapper`, which sits above the shell in the tree, so toggling between shells does not re-mount shared state. `IdeToolBridge` is intentionally absent — IDE-context tool queries return empty in chat-only mode, matching Claude desktop behaviour. The immersive flag is toggled via `Settings → General`, keyboard shortcut `Ctrl+Alt+I`, the View menu, or programmatically via the `agent-ide:toggle-immersive-chat` DOM event. See `src/renderer/components/Layout/ChatOnlyShell/` for the full implementation.

### Feature Folder Structure

Each feature folder under `src/renderer/components/` is self-contained:

```
components/
  AgentChat/
    AgentChatWorkspace.tsx    # State owner: thread list, active thread
    AgentChatConversation.tsx # Message stream rendering
    AgentChatComposer.tsx     # Input composer with mentions, slash commands
    AgentChatTabBar.tsx       # Thread tab management
    AgentChatThreadList.tsx   # Thread history sidebar
    AgentChatToolCard.tsx     # Tool call display
    SessionMemoryPanel.tsx    # Cross-session memory viewer
    (+ many more message/block renderers and hooks)
  AgentMonitor/
    AgentMonitorManager.tsx   # State owner: event aggregation
    AgentCard.tsx             # Per-session card
    AgentEventLog.tsx         # Event stream display
    AgentSummaryBar.tsx       # Summary stats
    CostDashboard.tsx         # Token/cost tracking
    ToolCallFeed.tsx          # Tool call stream
    ApprovalDialog.tsx        # Pre-execution approval UI
  Analytics/
    AnalyticsDashboard.tsx    # Usage analytics overview (lazy-loaded)
  CommandPalette/
    CommandPalette.tsx        # Overlay with search/filter
    SymbolSearch.tsx          # Symbol search overlay
  ContextBuilder/
    ContextBuilder.tsx        # Manual context selection UI
  DiffReview/
    DiffReviewManager.tsx     # State owner: diff review flow
    DiffReviewPanel.tsx       # Unified diff view
  ExtensionStore/
    ExtensionStorePanel.tsx   # Open VSX extension browser
  FileTree/
    FileTree.tsx              # State owner: virtual tree, multi-root
    FileTreeItem.tsx          # Single tree node
    ProjectPicker.tsx         # Folder selector dropdown
    StagingArea.tsx           # Git staging area in file tree
    VirtualTreeList.tsx       # Virtualised row renderer
  FileViewer/
    FileViewerManager.tsx     # Context provider: open files, active tab
    FileViewer.tsx            # Syntax-highlighted content (shiki)
    MultiBufferManager.tsx    # Multi-buffer / excerpt view
  GitPanel/
    GitPanel.tsx              # State owner: git status, staging, commits
    BranchSelector.tsx        # Branch switch/create
  Layout/
    AppLayout.tsx             # Structural shell (slot-based, no business logic)
    InnerAppLayout.tsx        # Wiring layer: providers + overlay rendering
    Sidebar.tsx               # Left sidebar container
    CentrePane.tsx            # Editor area container
    AgentMonitorPane.tsx      # Right sidebar container
    TerminalPane.tsx          # Bottom panel container
    RightSidebarTabs.tsx      # Right sidebar view switcher
    TitleBar.tsx              # Window title bar + menus
    StatusBar.tsx             # Bottom status bar
    ActivityBar.tsx           # VS Code-style icon strip
    useResizable.ts           # Hook: drag-to-resize with persistence
    usePanelCollapse.ts       # Hook: collapse state with keyboard shortcuts
  McpStore/
    McpStorePanel.tsx         # MCP server registry browser
  MultiSession/
    MultiSessionLauncher.tsx  # Launch multiple agent sessions
    MultiSessionMonitor.tsx   # Monitor parallel sessions
  SessionReplay/
    SessionReplayPanel.tsx    # Replay recorded agent sessions
  Settings/
    SettingsModal.tsx         # Full settings panel (tabbed)
    SettingsPanel.tsx         # Settings content area
    (sections: General, Appearance, Terminal, Claude, Codex, Hooks,
               Keybindings, Extensions, Providers, ModelSlots, MCP, etc.)
  Terminal/
    TerminalManager.tsx       # State owner: sessions, spawn/kill lifecycle
    TerminalInstance.tsx      # Single xterm.js terminal
    TerminalTabs.tsx          # Tab bar rendering
  TimeTravel/
    TimeTravelPanel.tsx       # Workspace snapshot timeline (workspace + thread scope)
  UsageModal/
    UsageModal.tsx            # Token/cost usage display
  BackgroundJobs/
    BackgroundJobsPanel.tsx   # Wave 6 — headless job queue UI (status pill, cancel, result)
  primitives/
    Button, Card, Input, Surface, Badge, Dropdown, Menu, TextArea, Divider
  shared/
    ErrorBoundary, Toast, Tooltip, Skeleton, NotificationCenter, EmptyState
```

## Layout System

```
┌────┬────────────┬───────────────────────┬──────────────────┐
│Act │  Sidebar   │                       │  Right Sidebar   │
│Bar │  (220px)   │    Centre Pane        │  (300px)         │
│40px│  resizable │    (flex: 1)          │  resizable       │
│    │  collapsible                       │  collapsible     │
├────┴────────────┴───────────────────────┴──────────────────┤
│                Terminal Pane (280px)                        │
│                resizable, collapsible                       │
├─────────────────────────────────────────────────────────────┤
│  Status Bar (24px)                                          │
└─────────────────────────────────────────────────────────────┘
```

- Outer container: `flex-col h-screen` with `TitleBar` at top, `StatusBar` at bottom
- ActivityBar: fixed 40px, never collapses, far-left icon strip
- Main row: `flex flex-1 min-h-0` (three columns: Sidebar + CentrePane + RightSidebar)
- CentrePane: `flex-1` fills remaining horizontal space
- Sidebars: explicit `width`/`minWidth` via style prop
- Terminal: explicit `height` via style prop, below the flex row
- Right sidebar uses `display:none` when collapsed (not unmounted) — preserves streaming chat state
- All panels independently collapsible (Ctrl+B, Ctrl+J, Ctrl+\\)
- Resize via drag handles with `useResizable()` hook (pointer-drag, snaps on `pointerup`)

## State Management

No external state library. State is managed through three patterns:

### 1. React Context (shared across component subtrees)

| Context            | Provider              | Hook                     | Scope                  |
| ------------------ | --------------------- | ------------------------ | ---------------------- |
| ProjectContext     | `ProjectProvider`     | `useProject()`           | Project root path      |
| FileViewerContext  | `FileViewerManager`   | `useFileViewerManager()` | Open file tabs         |
| MultiBufferContext | `MultiBufferManager`  | `useMultiBuffer()`       | Multi-buffer excerpts  |
| DiffReviewContext  | `DiffReviewProvider`  | `useDiffReview()`        | Diff review state      |
| AgentEventsContext | `AgentEventsProvider` | `useAgentEvents()`       | Hook event stream      |
| ApprovalContext    | `ApprovalProvider`    | `useApproval()`          | Pre-execution approval |
| ToastContext       | `ToastProvider`       | `useToast()`             | Toast notifications    |
| FocusContext       | `FocusProvider`       | `useFocus()`             | Panel focus management |

### 2. Component-Local State (owned by manager components)

| Component           | State                           | Persistence                   |
| ------------------- | ------------------------------- | ----------------------------- |
| TerminalManager     | `sessions[]`, `activeSessionId` | None (ephemeral)              |
| AgentMonitorManager | `events[]`, `agents[]`          | None (ephemeral)              |
| AgentChatWorkspace  | `threads[]`, `activeThreadId`   | SQLite via IPC                |
| FileTree            | virtual tree, selection, search | None (ephemeral)              |
| GitPanel            | git status, staged files        | None (ephemeral)              |
| CommandPalette      | `isOpen`, `query`, `recentIds`  | None                          |
| usePanelCollapse    | `collapsed{}`                   | localStorage                  |
| useResizable        | `sizes{}`                       | localStorage + electron-store |

### 3. Custom Hooks (encapsulate IPC + state)

| Hook                    | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `useConfig()`           | Load/write electron-store config via IPC, optimistic updates |
| `useTheme()`            | Apply theme CSS vars, persist selection                      |
| `useAgentEvents()`      | Aggregate hook events into agent sessions                    |
| `useFileWatcher()`      | Track file change events from chokidar                       |
| `usePty()`              | PTY session lifecycle (used by TerminalInstance)             |
| `useCostTracking()`     | Token/cost aggregation from hook events                      |
| `useDiffSnapshots()`    | Workspace snapshot management                                |
| `useTerminalSessions()` | Terminal session restore across reloads                      |

## Data Flow Patterns

### Config Read/Write

```
Renderer                    Preload                     Main
useConfig() ──invoke──→ config:getAll ──handle──→ store.store
config.set() ──invoke──→ config:set ──handle──→ store.set()
```

### Terminal I/O

```
Renderer                    Preload                     Main
TerminalManager             ptyAPI                      pty.ts
  spawn() ──invoke──→   pty:spawn    ──handle──→  pty.spawn()
  xterm.onData ──invoke──→ pty:write ──handle──→  proc.write()
  pty.onData(cb) ←──on── pty:data:${id} ←──send── proc.onData()
  pty.onExit(cb) ←──on── pty:exit:${id} ←──send── proc.onExit()
```

### File Operations

```
Renderer                    Preload                     Main
FileList                    filesAPI                    ipc.ts
  readDir() ──invoke──→ files:readDir ──handle──→ fs.readdir()
  selectFolder() ──invoke──→ files:selectFolder ──handle──→ dialog.showOpenDialog()
FileViewerManager
  readFile() ──invoke──→ files:readFile ──handle──→ fs.readFile()
  onFileChange(cb) ←──on── files:change ←──send── chokidar watcher
```

### Hook Events (Claude Code → Ouroboros)

```
Claude Code Hook Script
  └─ Writes NDJSON to named pipe \\.\pipe\agent-ide-hooks
       └─ hooksNet.ts parses → onPayload callback
            └─ hooks.ts dispatchToRenderer() + approval flow + graph invalidation
                 └─ win.webContents.send('hooks:event', payload)
                      └─ preload: hooks.onAgentEvent(cb)
                           └─ AgentEventsProvider / useAgentEvents (renderer)
                                └─ AgentMonitorManager, AgentChatWorkspace
```

### Background Job Queue (#103)

```
Renderer                         Preload                        Main
BackgroundJobsPanel              backgroundJobsAPI              backgroundJobs/
  enqueue(prompt) ──invoke──→ backgroundJobs:enqueue ──→ jobScheduler.enqueue()
  cancel(id)      ──invoke──→ backgroundJobs:cancel  ──→ jobScheduler.cancel()
  list()          ──invoke──→ backgroundJobs:list    ──→ jobStore.listAll()
  subscribe(cb) ←──on──  backgroundJobs:update ←──send── jobScheduler.onChange()
```

- `jobStore.ts` persists jobs to the `background_jobs` SQLite table in `storage/database.ts`.
- `jobScheduler.ts` enforces `backgroundJobsMaxConcurrent` (default 2) and polls queue on completion.
- `jobRunner.ts` spawns via `spawnAgentViaPtyHost`; correlates completion via `sessionId` from the first stream-json event.
- On restart, running jobs are reconciled: any with `status = 'running'` and a dead PID are set to `error: 'interrupted'`.

### Session Checkpoints (#107)

```
chatOrchestrationBridgeGit.ts
  └─ captureHeadHash() (pre-turn) + post-turn capture
       └─ writes commitHash onto AgentChatMessageRecord.checkpointCommit
            └─ checkpointStore.ts — getCheckpointsForThread(threadId)
                 └─ ipc-handlers/checkpoint.ts — list / restore / delete
                      └─ renderer: useThreadCheckpoints()
                           └─ AgentChatMessageActions.tsx — RewindButton
```

- Checkpoint commits are pushed to `refs/ouroboros/checkpoints/<threadId>` to avoid polluting `main`.
- Restore uses existing `git:restoreSnapshot` (checkout with stash guard). Intervening messages flagged `rewound`.
- `checkpointStore` is a thin wrapper over the existing `threadStoreSqlite` — no separate database.

### /spec Slash Command (#108)

```
Composer → AgentChatComposerSupport.runComposerSlashCommand('spec', featureName)
  └─ window.electronAPI.spec.scaffold({ projectRoot, featureName })
       └─ ipc-handlers/specScaffold.ts
            └─ reads src/main/templates/spec/{requirements,design,tasks}.md
                 (copied to out/main/templates/spec/ at build time by copyTemplatesPlugin)
            └─ writes .ouroboros/specs/<slug>/{requirements,design,tasks}.md
  └─ dispatches agent-ide:open-file for each created file
```

### Streaming Inline Edit (#116)

```
FileViewer (Ctrl+K)
  └─ useInlineEdit.submit()
       ├─ flag OFF → ai:inline-edit IPC (bulk replace, existing path)
       └─ flag ON  → useStreamingInlineEdit.startStream()
                       └─ ai:streamInlineEdit:<requestId> IPC
                            └─ aiHandlers.ts streams content_block_delta tokens
                                 └─ editor.executeEdits('inline-edit-stream', [...])
                                      └─ done event → commit; Escape → cancel + revert
```

- Streaming inline edit is always-on (Wave 40 Phase F removed the feature flag; the enabled code path is inlined directly).
- Streaming transport: dedicated `ai:streamInlineEdit:<requestId>` channel (not the chat stream-json channel).
- Single undo: `editor.pushStackElement()` between tokens; undo rolls back the whole edit.

### In-Editor Hunk Gutter (#106)

```
MonacoEditorInstance.tsx
  └─ useEditorHunkDecorations(filePath) → decorations from diffReviewStore
       └─ EditorHunkGutterActions.tsx (content widget per hunk boundary)
            └─ click ✓ → window.electronAPI.git.stageHunk(rawPatch)
            └─ click ✗ → window.electronAPI.git.revertHunk(rawPatch)
  └─ DiffReviewProvider pushes decision: 'accepted' | 'rejected'
```

- Gutter and DiffReview panel stay in sync through shared `diffReviewStore` state.
- CSS for gutter glyphs in `src/renderer/styles/editor-hunk.css` uses design tokens (`--diff-add-bg`, `--diff-del-bg`).

### Parallel Agent Conflict Detection (#104)

```
hooks.ts PostToolUse events + stream-json tool_use
  └─ conflictMonitor.ts — Map<sessionId, Set<file>>
       └─ graphQuery.detectChangesForSession(sessionId, touchedFiles)
            └─ pairwise symbol intersection per project root
                 └─ ipc-handlers/conflict.ts — getReports / subscribe
                      └─ renderer: useAgentConflicts()
                           └─ AgentConflictBanner.tsx (inline, both affected threads)
```

- Graph lookup is debounced 200ms and runs async to avoid blocking the pipe response.
- Falls back to file-level overlap when graph is cold (index in progress), sets severity `'warning'`.
- Scoped per `projectRoot` — multi-root workspaces do not cross-contaminate.

## Rendering Patterns

### Virtualised Lists

`FileList` uses manual virtualisation (not react-window): fixed 32px item height, `visibleStart`/`visibleEnd` computed from scroll position, overscan of 5 items, Fuse.js for fuzzy search with match highlighting.

### Terminal Instances

All sessions rendered simultaneously with `display: none/block` toggling (prevents xterm.js teardown/recreation on tab switch). Canvas renderer is used (not WebGL). Double-rAF guard for fit() calls after open().

### File Viewer

Syntax highlighting via shiki (lazy-loaded grammars). Binary detection via null-byte heuristic. Dirty-on-disk tracking via chokidar events.

### Theming

5 built-in themes defined as CSS var maps in `src/renderer/themes/`. Applied by setting vars on `document.documentElement.style`. Terminal theme colors derived from `--term-*` CSS vars. Theme switch triggers `theme:changed` IPC event + `requestAnimationFrame` sync.

## Ownership Rules

1. **State owners** — Components that create and manage state (Manager/Provider suffix):
   - `TerminalManager` owns `sessions[]`
   - `FileViewerManager` owns `openFiles[]`
   - `AgentMonitorManager` owns `events[]`
   - `AgentChatWorkspace` owns `threads[]`, `activeThreadId`
   - `GitPanel` owns git status, staged files
   - `App/InnerApp` owns `recentProjects`, `settingsOpen`

2. **Structural components** — Layout shells that accept `React.ReactNode` slots:
   - `AppLayout`, `Sidebar`, `CentrePane`, `TerminalPane`, `AgentMonitorPane`
   - These know about sizing/collapse but NOT about business data

3. **Presentational components** — Pure render based on props:
   - `FileTreeItem`, `FileViewer`, `AgentCard`, `CommandItem`
   - Zero state, zero side effects

4. **Hooks** — Encapsulate IPC + state for reuse:
   - `useConfig()`, `useTheme()`, `useAgentEvents()`, `useFileWatcher()`
   - Each hook owns its own loading/error state

### What Goes Where

| Need to...                | Put it in...                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| Read/write files          | `ipc.ts` handler → `files:readFile` / `files:readDir`                 |
| Spawn a terminal          | `pty.ts` via `ipc.ts` handler → `pty:spawn`                           |
| Persist user preference   | `config.ts` via `ipc.ts` handler → `config:set`                       |
| Add a UI panel            | `Layout/` structural component with slots                             |
| Add file tree feature     | `FileTree/` — state in `FileTree.tsx`, display in `FileTreeItem.tsx`  |
| Add keyboard shortcut     | `usePanelCollapse.ts` (layout) or `useCommandRegistry.ts` (commands)  |
| Add a theme               | `themes/` — new ThemeDefinition + register in `themes/index.ts`       |
| Handle Claude Code events | `hooks.ts` (server) → preload → `useAgentEvents.ts` (renderer)        |
| Add a settings section    | `Settings/` — new `*Section.tsx` + register in `settingsTabs.ts`      |
| Add agent chat feature    | `AgentChat/` — extend `AgentChatWorkspace` or add a new renderer/hook |

## Security Model

- `contextIsolation: true` — renderer cannot access Node.js
- `sandbox: true` — renderer runs in Chromium sandbox
- `nodeIntegration: false` — no `require()` in renderer
- CSP via `onHeadersReceived` — restricts script/style/connect sources
- `setWindowOpenHandler → deny` — no popup windows
- `will-navigate` — blocks non-local navigation
- `openExternal` — only `http:` / `https:` URLs allowed

## Keyboard Shortcuts

| Shortcut     | Action               |
| ------------ | -------------------- |
| Ctrl+B       | Toggle left sidebar  |
| Ctrl+J       | Toggle terminal      |
| Ctrl+\\      | Toggle agent monitor |
| Ctrl+,       | Toggle settings      |
| Ctrl+Shift+P | Command palette      |

---

## Session Primitive (Wave 16)

`src/main/session/` owns the cross-restart session lifecycle. Sessions track per-window project roots, active thread, and panel state across reboots.

### Key types

- `SessionRecord` — persisted to SQLite (`storage/database.ts`, `sessions` table). Fields: `windowId`, `projectRoots[]`, `activeThreadId`, bounds.
- `sessionMigration.ts` — one-time migration from the legacy `windowSessions` electron-store key to `sessionsData`. The write path in `windowManager.persistWindowSessions()` has been cut; only `sessionsData` is written now.
- `sessionStartup.ts` — calls `migrateWindowSessionsToSessions()` on boot, then restores windows from `sessionsData`.

### Per-Window Project Isolation

Each `BrowserWindow` owns its project roots independently via `ManagedWindow.projectRoots` in `windowManager.ts`. The renderer persists roots per-window via `window.setProjectRoots()` IPC (not the global `multiRoots` config key). `pathSecurity` reads per-window roots first, with `defaultProjectRoot` as a cold-boot fallback only.

Multi-window workspaces do not share project roots — changing roots in window A has no effect on window B. Conflict detection (`agentConflict/`) scopes overlap detection per `projectRoot`.

---

## Layout Presets (Wave 17)

Layout presets provide named configurations of panel sizes and visibility, resolved at runtime by `LayoutPresetResolver`. Three built-in presets:

| Preset | Panel configuration | When active |
|---|---|---|
| `ide-primary` | Sidebar open (220px), terminal open (280px), right sidebar open (300px) | Default for Electron desktop |
| `chat-primary` | Sidebar collapsed, terminal collapsed, right sidebar maximized | When chat takes focus and sidebar/terminal are closed |
| `mobile-primary` | Single-column, no sidebar, no terminal, no right sidebar as a pane — panels via drawer | When `layout.mobilePrimary === true` AND viewport < 768px |

Preset resolution is in `src/renderer/hooks/useWorkspaceLayouts.ts`. Presets can be overridden by user drag-to-resize (persisted to `electron-store` key `panelSizes`). localStorage key `agent-ide:panel-sizes` is the synchronous cold-start read source (avoids flash on mount); electron-store is the durable cross-profile persistence target. Both are live and serve different roles — this is intentional, not a fallback.

Custom layout snapshots (named saves) live in SQLite via `workspaceLayoutStore.ts`. The `TimeTravelPanel` exposes the timeline of snapshots.

---

## Provider Abstraction (Wave 36)

`src/main/providers/` contains a thin session provider abstraction over the available AI backends.

### SessionProvider interface

```ts
interface SessionProvider {
  spawn(request: SpawnRequest): Promise<SessionHandle>;
  send(sessionId: string, text: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  onEvent(sessionId: string, cb: (event: ProviderEvent) => void): () => void;
  checkAvailability(): Promise<AvailabilityResult>;
}
```

### Provider registry

`providerRegistry.ts` maps `'claude' | 'codex' | 'gemini'` to a singleton `SessionProvider` instance. Providers are NOT the same as `ModelProvider` in the older `src/main/providers.ts` — that namespace covers model-to-spawn-config mapping; `SessionProvider` is the higher-level session lifecycle abstraction.

### Available providers

| Provider ID | Implementation | Notes |
|---|---|---|
| `'claude'` | `claudeSessionProvider.ts` — wraps `spawnAgentPty` + `ptyAgentBridge` | Full tool-use, cost metadata, interactive PTY |
| `'codex'` | `codexSessionProvider.ts` — wraps `spawnCodexExecProcess` (NDJSON exec) | Single-turn; `send()` is a no-op |
| `'gemini'` | `geminiSessionProvider.ts` — spawns `gemini --prompt ... --yolo` | Heuristic NDJSON; no tool-use, no cost metadata |

Multi-provider mode is gated on `config.providers.multiProvider` (default `false`). `profileSpawnHelper.ts::spawnForProfile()` routes through the registry when `Profile.providerId` is set (optional, defaults to `'claude'`).

Provider compare mode (`CompareProviders.tsx`) runs two providers in parallel against the same prompt and renders a per-word diff via `wordDiff.ts`. Doubles cost — a session-remembered warning is shown before the first run.
