# Architecture

## Three-Process Model

Agent IDE follows Electron's standard three-process architecture with strict isolation:

```
┌──────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                 │
│  main.ts → Window creation, lifecycle, security          │
│  ipc.ts  → IPC handler registration (18+ channels)      │
│  pty.ts  → node-pty session management                   │
│  hooks.ts → Named pipe / TCP server for Claude events    │
│  config.ts → electron-store persistence                  │
│  menu.ts → Native application menu                       │
│  hookInstaller.ts → Auto-install Claude Code hooks       │
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
│  App.tsx → Root: config bootstrap, theme, context wiring │
│  Components → Feature folders with barrel exports        │
│  Hooks → useConfig, useTheme, usePty, useAgentEvents     │
│  Contexts → ProjectContext                               │
│  Themes → 5 theme definitions (CSS var maps)             │
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
   ├─ index.tsx → ReactDOM.render(<App />)
   ├─ App()
   │   ├─ useTheme() → apply CSS vars to :root
   │   ├─ useConfig() → load config via IPC
   │   ├─ Show LoadingScreen while config loads
   │   └─ Render ProjectProvider → InnerApp
   └─ InnerApp()
       ├─ Wire up menu event listeners
       ├─ Wire up custom DOM event listeners
       └─ Render FileViewerManager → AppLayout + CommandPalette + SettingsModal
```

## Process Boundaries & Module Responsibilities

### Main Process — Each File Has One Job

| File | Single Responsibility | Does NOT |
|------|----------------------|----------|
| `main.ts` | App lifecycle, window creation, security setup | Handle IPC, manage PTY, serve hooks |
| `ipc.ts` | Register/cleanup IPC handlers, delegate to domain modules | Implement business logic directly |
| `pty.ts` | node-pty session CRUD, bridge data/exit to renderer | Read config, handle files |
| `hooks.ts` | Socket server, NDJSON parsing, event dispatch to renderer | Manage PTY, read files |
| `config.ts` | electron-store read/write with schema validation | Handle IPC registration |
| `menu.ts` | Build native menu, send menu events to renderer | Handle responses |
| `hookInstaller.ts` | Write/update hook scripts in ~/.claude/hooks/ | Serve hooks, manage config |

### Preload
Single file (`preload.ts`) that maps raw IPC channels to a typed API object:
- Groups by domain: `pty`, `config`, `files`, `hooks`, `app`, `theme`
- Wraps `ipcRenderer.on` into functions that return cleanup callbacks
- Never exposes `ipcRenderer` directly

### Renderer
React SPA with no Node.js access. All system interaction through `window.electronAPI`.

## Component Tree

```
App
├── useTheme()                        # Apply CSS vars to :root
├── useConfig()                       # Load persisted config
├── ProjectProvider                   # Project root context
│   └── InnerApp
│       ├── FileViewerManager         # Open files context provider
│       │   ├── AppLayout             # Three-column + bottom panel
│       │   │   ├── Sidebar
│       │   │   │   ├── ProjectPicker           # Folder selector dropdown
│       │   │   │   └── FileList                # Fuzzy-searchable file tree
│       │   │   │       └── FileListItem[]      # Virtualised rows
│       │   │   ├── CentrePane
│       │   │   │   ├── EditorTabBar            # Open file tabs
│       │   │   │   │   └── FileViewerTabs
│       │   │   │   └── EditorContent
│       │   │   │       ├── Breadcrumb
│       │   │   │       └── FileViewer          # Syntax-highlighted (shiki)
│       │   │   ├── AgentMonitorPane
│       │   │   │   └── AgentMonitorManager
│       │   │   │       ├── AgentSummaryBar
│       │   │   │       ├── AgentCard[]
│       │   │   │       ├── AgentEventLog
│       │   │   │       └── ToolCallFeed
│       │   │   └── TerminalPane
│       │   │       └── TerminalManager
│       │   │           ├── TerminalTabs
│       │   │           └── TerminalInstance[]   # xterm.js instances
│       │   ├── CommandPalette                   # Fixed overlay
│       │   └── SettingsModal                    # Fixed overlay
```

### Feature Folder Structure

Each feature folder under `src/renderer/components/` is self-contained:

```
components/
  Terminal/
    TerminalManager.tsx    # State owner: sessions, spawn/kill lifecycle
    TerminalInstance.tsx    # Single xterm.js terminal (no state ownership)
    TerminalTabs.tsx       # Pure presentational: tab bar rendering
    index.ts               # Barrel exports
  FileTree/
    FileList.tsx           # State owner: file collection, search, virtualisation
    FileListItem.tsx       # Pure presentational: single file row
    ProjectPicker.tsx      # State owner: dropdown open/close, folder selection
  FileViewer/
    FileViewerManager.tsx  # Context provider: open files, active tab
    FileViewer.tsx         # Pure presentational: syntax-highlighted content
    FileViewerTabs.tsx     # Pure presentational: tab bar
    Breadcrumb.tsx         # Pure presentational: path breadcrumb
  AgentMonitor/
    AgentMonitorManager.tsx  # State owner: event aggregation
    AgentCard.tsx            # Pure presentational
    AgentEventLog.tsx        # Pure presentational
    AgentSummaryBar.tsx      # Pure presentational
    ToolCallFeed.tsx         # Pure presentational
  Layout/
    AppLayout.tsx          # Slot-based layout shell (no business logic)
    Sidebar.tsx            # Structural: width, collapse, header/content slots
    CentrePane.tsx         # Structural: tabBar/content slots
    AgentMonitorPane.tsx   # Structural: width, collapse, summary/content slots
    TerminalPane.tsx       # Structural: height, collapse, tabs/content slots
    useResizable.ts        # Hook: drag-to-resize with persistence
    usePanelCollapse.ts    # Hook: collapse state with keyboard shortcuts
    ResizeHandle.tsx       # Pure presentational
  CommandPalette/
    CommandPalette.tsx     # Overlay with search/filter
    CommandItem.tsx        # Pure presentational
    useCommandPalette.ts   # Hook: open/close state
    useCommandRegistry.ts  # Hook: command definitions, execution
```

## Layout System

```
┌─────────────┬───────────────────────┬──────────────────┐
│  Sidebar    │                       │  Agent Monitor   │
│  (220px)    │    Centre Pane        │  (300px)         │
│  resizable  │    (flex: 1)          │  resizable       │
│  collapsible│                       │  collapsible     │
├─────────────┴───────────────────────┴──────────────────┤
│                Terminal Pane (280px)                     │
│                resizable, collapsible                    │
└─────────────────────────────────────────────────────────┘
```

- Outer container: `flex-col h-screen`
- Main row: `flex flex-1 min-h-0` (three columns)
- CentrePane: `flex-1` fills remaining horizontal space
- Sidebars: explicit `width`/`minWidth` via style prop
- Terminal: explicit `height` via style prop, below the flex row
- All panels independently collapsible (Ctrl+B, Ctrl+J, Ctrl+\\)
- Resize via drag handles with `useResizable()` hook (rAF-throttled mouse tracking)

## State Management

No external state library. State is managed through three patterns:

### 1. React Context (shared across component subtrees)
| Context | Provider | Hook | Scope |
|---------|----------|------|-------|
| ProjectContext | `ProjectProvider` | `useProject()` | Project root path |
| FileViewerContext | `FileViewerManager` | `useFileViewerManager()` | Open file tabs |

### 2. Component-Local State (owned by manager components)
| Component | State | Persistence |
|-----------|-------|-------------|
| TerminalManager | `sessions[]`, `activeSessionId` | None (ephemeral) |
| AgentMonitorManager | `events[]`, `agents[]` | None (ephemeral) |
| CommandPalette | `isOpen`, `query`, `recentIds` | None |
| usePanelCollapse | `collapsed{}` | localStorage |
| useResizable | `sizes{}` | localStorage + electron-store |

### 3. Custom Hooks (encapsulate IPC + state)
| Hook | Purpose |
|------|---------|
| `useConfig()` | Load/write electron-store config via IPC, optimistic updates |
| `useTheme()` | Apply theme CSS vars, persist selection |
| `useAgentEvents()` | Aggregate hook events into agent sessions |
| `useFileWatcher()` | Track file change events from chokidar |
| `usePty()` | PTY session lifecycle (used by TerminalInstance) |

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

### Hook Events (Claude Code → Agent IDE)
```
Claude Code Hook Script
  └─ Writes NDJSON to named pipe \\.\pipe\agent-ide-hooks
       └─ hooks.ts parses → dispatchToRenderer()
            └─ win.webContents.send('hooks:event', payload)
                 └─ preload: hooks.onAgentEvent(cb)
                      └─ AgentMonitorManager / useAgentEvents
```

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
   - `App/InnerApp` owns `recentProjects`, `settingsOpen`

2. **Structural components** — Layout shells that accept `React.ReactNode` slots:
   - `AppLayout`, `Sidebar`, `CentrePane`, `TerminalPane`, `AgentMonitorPane`
   - These know about sizing/collapse but NOT about business data

3. **Presentational components** — Pure render based on props:
   - `FileListItem`, `FileViewer`, `Breadcrumb`, `AgentCard`, `CommandItem`
   - Zero state, zero side effects

4. **Hooks** — Encapsulate IPC + state for reuse:
   - `useConfig()`, `useTheme()`, `useAgentEvents()`, `useFileWatcher()`
   - Each hook owns its own loading/error state

### What Goes Where

| Need to... | Put it in... |
|------------|-------------|
| Read/write files | `ipc.ts` handler → `files:readFile` / `files:readDir` |
| Spawn a terminal | `pty.ts` via `ipc.ts` handler → `pty:spawn` |
| Persist user preference | `config.ts` via `ipc.ts` handler → `config:set` |
| Add a UI panel | `Layout/` structural component with slots |
| Add file tree feature | `FileTree/` — state in FileList, display in FileListItem |
| Add keyboard shortcut | `usePanelCollapse.ts` (layout) or `useCommandRegistry.ts` (commands) |
| Add a theme | `themes/` — new ThemeDefinition + register in `themes/index.ts` |
| Handle Claude Code events | `hooks.ts` (server) → preload → `useAgentEvents.ts` (renderer) |

## Security Model

- `contextIsolation: true` — renderer cannot access Node.js
- `sandbox: true` — renderer runs in Chromium sandbox
- `nodeIntegration: false` — no `require()` in renderer
- CSP via `onHeadersReceived` — restricts script/style/connect sources
- `setWindowOpenHandler → deny` — no popup windows
- `will-navigate` — blocks non-local navigation
- `openExternal` — only `http:` / `https:` URLs allowed

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+B | Toggle left sidebar |
| Ctrl+J | Toggle terminal |
| Ctrl+\\ | Toggle agent monitor |
| Ctrl+, | Toggle settings |
| Ctrl+Shift+P | Command palette |
