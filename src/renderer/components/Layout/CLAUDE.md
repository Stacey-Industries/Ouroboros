# Layout — IDE shell: panels, resizing, collapse, status bar, and workspace layouts

## Architecture

Five-panel layout (VS Code-style): Sidebar | CentrePane + Terminal | AgentMonitorPane, wrapped in TitleBar + StatusBar.

**Composition hierarchy:**

```
InnerAppLayout (wiring layer — providers, overlays, slot resolution)
  └─ AppLayoutConnected (reads FileViewer context for status bar)
       └─ AppLayout (structural shell — owns resize + collapse state)
            ├─ TitleBar (dropdown menus, notifications, context-layer progress)
            ├─ Sidebar (left, file tree / search / git / extensions)
            ├─ CentrePane (editor tab bar + content)
            ├─ TerminalPane (bottom, collapsible)
            ├─ AgentMonitorPane (right sidebar — chat, monitor, git, analytics, memory, rules)
            └─ StatusBar (git branch, file info, layout switcher, LSP status)
```

## Key Files

| File | Role |
|---|---|
| `ChatOnlyShell/` | **Immersive chat-only shell (Wave 42)** — `ChatOnlyShell`, `ChatOnlyTitleBar`, `ChatOnlyStatusBar`, `ChatOnlySessionDrawer`, `ChatOnlyDiffOverlay`. Replaces `InnerAppLayout` when `isChatWindow \|\| immersiveFlag`. `TerminalPane`, `CentrePaneConnected`, `RightSidebarTabs`, `Sidebar`, and `IdeToolBridge` are NOT mounted in this shell. |
| `AppLayout.tsx` | Structural shell — assembles panels, owns `useResizable` + `usePanelCollapse` state, handles DOM panel events |
| `InnerAppLayout.tsx` | Wiring layer — wraps with providers (FileViewerManager, MultiBufferManager, DiffReviewProvider), resolves all slots, renders overlays (CommandPalette, FilePicker, SymbolSearch) |
| `AppLayoutConnected.tsx` | Thin bridge — reads FileViewerManager context for status bar data |
| `CentrePaneConnected.tsx` | Centre pane controller — switches between EditorContent, DiffReview, SessionReplay, Settings, Usage, ContextBuilder, TimeTravel, Extensions, MCP via display:none layers |
| `TitleBar.tsx` | Window title bar — draggable region, dropdown menus (File/Edit/View/Go/Terminal/Help), notification center, context-layer progress indicator |
| `EditorContent.tsx` | Centre pane file content — file viewer, multi-buffer view, action bars |
| `EditorSplitView.tsx` | Split-pane editor — extracted from EditorContent.tsx to stay under line limits |
| `EditorTabBar.tsx` | Tab bar for open files + special view tabs (Settings, Usage, etc.), split editor button |
| `RightSidebarTabs.tsx` | Right sidebar — chat-dominant; secondary views (monitor/git/analytics/memory/rules) via view-switcher dropdown |
| `Sidebar.tsx` | Left sidebar container — header slot + content slot |
| `CentrePane.tsx` | Simple flex container — tab bar slot + content area |
| `TerminalPane.tsx` | Bottom panel — tab management via TerminalTabs, collapses to 32px header-only strip |
| `AgentMonitorPane.tsx` | Right sidebar container — no own header (RightSidebarTabs owns it) |
| `StatusBar.tsx` | 24px bottom bar — git branch, file path, line count, language, layout switcher, LSP status |
| `useResizable.ts` | Pointer-drag resize hook — accent preview line during drag (panels frozen), snaps on `pointerup`, persists to localStorage + electron-store |
| `usePanelCollapse.ts` | Collapse state hook — toggle/expand/collapse/applyState per panel, keyboard shortcuts, persists to localStorage |
| `ResizeDivider.tsx` / `ResizeHandle.tsx` | 5px drag handles with accent highlight on hover/active |
| `SidebarSections.tsx` | Default sidebar content — file tree + outline/bookmarks/timeline collapsible sections |
| `SidebarSection.tsx` | Generic collapsible section component used by SidebarSections |
| `LayoutSwitcher.tsx` | Workspace layout save/switch dropdown (floats above status bar) |
| `StatusBarControls.tsx` | Barrel re-export — implementation split into `.actions.tsx` (interactive controls) and `.shared.tsx` (shared primitives + styles) |
| `LspStatus.tsx` | LSP server status indicator embedded in StatusBar |
| `IdeToolBridge.tsx` | Mounts inside LayoutProviders — bridges IDE tool calls from agent into editor actions |
| `InnerAppLayout.agent.tsx` | `AgentSidebarContent` — assembles RightSidebarTabs with all view content slots wired |
| `StatusBarAuthIndicator.tsx` | Auth status chip in status bar |
| `TimeTravelPanelConnected.tsx` | Thin connector for the TimeTravel panel shown in CentrePaneConnected |

## Slot-Based Composition

`AppLayout` is fully slot-driven via `AppLayoutSlots` — zero business logic in the structural shell. These are the **actual** slots (from the interface in `AppLayout.tsx`):

| Slot | Type | Filled by |
|---|---|---|
| `sidebarHeader` | `ReactNode` | ProjectPicker |
| `sidebarContent` | `ReactNode` | SidebarSections |
| `editorTabBar` | `ReactNode` | EditorTabBar |
| `editorContent` | `ReactNode` | CentrePaneConnected |
| `agentCards` | `ReactNode` | AgentSidebarContent (wraps RightSidebarTabs) |
| `terminalContent` | `ReactNode` | TerminalManager |

## Panel State

**Resize** (`useResizable`):

- Panels: `leftSidebar`, `rightSidebar`, `terminal`
- Defaults: 220 / 300 / 280 px. Min: 140 / 200 / 120. Max: 480 / 600 / 600
- Drag shows a `position:fixed; z-index:9999` preview line; panel snaps on `pointerup`
- `rightSidebar` and `terminal` use sign `-1` (dragging left/up grows them)
- Persisted to `localStorage` key `agent-ide:panel-sizes` and `electron-store` key `panelSizes`
- Double-click a divider to `resetSize()` to default

**Collapse** (`usePanelCollapse`):

- Targets: `leftSidebar`, `rightSidebar`, `terminal`, `editor`
- Default shortcuts: `Ctrl+B` (sidebar), `Ctrl+J` (terminal), `Ctrl+\` (right sidebar)
- Overridable via `keybindings` prop — action IDs: `view:toggle-sidebar`, `view:toggle-terminal`, `view:toggle-agent-monitor`
- Persisted to `localStorage` key `agent-ide:panel-collapse`
- Right sidebar uses `display:none` instead of unmounting — preserves streaming chat state

## CentrePaneConnected — Special Views

`CentrePaneConnected` maintains an `openViews: SpecialViewType[]` array. All opened views are rendered simultaneously with `display:none`/`undefined` toggling — **none are unmounted when inactive**. This preserves in-progress state (e.g. ContextBuilder inputs). Views:

| Event | View key |
|---|---|
| `agent-ide:open-settings-panel` | `settings` |
| `agent-ide:open-usage-panel` | `usage` |
| `agent-ide:open-context-builder` | `context-builder` |
| `agent-ide:open-time-travel` | `time-travel` |
| `agent-ide:open-extension-store` | `extensions` |
| `agent-ide:open-mcp-store` | `mcp` |

DiffReview and SessionReplay take over the entire centre pane (they replace the tab container entirely, not just toggle a layer).

## RightSidebarTabs — Views

Six views switchable via dropdown: `chat | monitor | git | analytics | memory | rules`. All panels are rendered with `display:none` hiding — not unmounted. Chat is always primary; other views render a back-to-chat `SecondaryViewHeader`. Thread tabs (including draft tabs) only appear in chat view.

## DOM Events Consumed

`AppLayout` listens for `CustomEvent`s dispatched on `window` (renderer-only — **not** Electron IPC):

| Event | Action |
|---|---|
| `agent-ide:toggle-sidebar` | Toggle left sidebar |
| `agent-ide:toggle-terminal` | Toggle terminal |
| `agent-ide:toggle-agent-monitor` | Toggle right sidebar |
| `agent-ide:toggle-editor` | Toggle editor panel |
| `agent-ide:open-agent-chat` / `agent-ide:focus-agent-chat` | Expand right sidebar + set focus |
| `agent-ide:focus-terminal-session` (`{ sessionId }`) | Expand terminal, activate or `focusOrCreate` session |
| `agent-ide:open-chat-in-terminal` (`{ claudeSessionId / codexThreadId }`) | Spawn resumed session in terminal |
| `agent-ide:apply-layout` (`WorkspaceLayout`) | Apply saved panel sizes + collapse state atomically |

Event name constants live in `../../hooks/appEventNames`. Never dispatch these from main process — use IPC for cross-process signals.

## Gotchas

- **Right sidebar is never unmounted when collapsed** — `display:none` is intentional. Unmounting destroys streaming chat state and model override selections.
- **All RightSidebarTabs views are always mounted** — same `display:none` pattern; switching views is instant and stateful.
- **TerminalPane collapsed height is 32px, not 0** — the header/tab row stays visible.
- **`StatusBarControls` is split across three files** (`.tsx` barrel, `.actions.tsx`, `.shared.tsx`) — avoids hitting ESLint complexity/line-count limits. Always re-export through the barrel.
- **Resize sign convention** — `rightSidebar` and `terminal` use `-1` because their resize handles are on the opposite edge (dragging left/up must grow them).
- **`agent-ide:apply-layout` is atomic** — calls both `applySizes` and `applyState` in the same handler so panels don't flash to an intermediate state.
- **`InnerAppLayout` providers order matters**: `FileViewerManager` wraps everything; `IdeToolBridge` must be inside `FileViewerManager` to access its context; `MultiBufferManager` and `DiffReviewProvider` are innermost.
- **Mobile nav** (`MobileNavBar`) is rendered by `AppLayout` but hidden via CSS (`web-mobile-only` class) in Electron — collapses the panel layout into a single-panel switcher for web/mobile deployment.

## Dependencies

| Direction | Module |
|---|---|
| Consumes | `FocusContext`, `ToastContext`, `ProjectContext` |
| Consumes | `FileViewer` — FileViewerManager, MultiBufferManager, DiffReviewProvider |
| Consumes | `Terminal` — TerminalManager, TerminalTabs, TerminalSession |
| Consumes | `AgentChat` — AgentChatWorkspace, ChatHistoryPanel |
| Consumes | `AgentMonitor`, `GitPanel`, `Analytics`, `CommandPalette`, `ExtensionStore`, `McpStore` |
| Consumes | `../../hooks/appEventNames`, `../../types/electron` (WorkspaceLayout, PanelSizes) |
| Consumed by | `App.tsx` (renderer root) via `InnerAppLayout` only |
