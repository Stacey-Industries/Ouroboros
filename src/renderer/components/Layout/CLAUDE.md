<!-- claude-md-auto:start -->

# Layout — IDE shell: panels, resizing, collapse, status bar, and workspace layouts

## Architecture

Five-panel layout (VS Code-style): ActivityBar | Sidebar | CentrePane + Terminal | AgentMonitorPane, wrapped in TitleBar + StatusBar.

**Composition hierarchy:**

```
InnerAppLayout (wiring layer — providers, overlays, slot resolution)
  └─ AppLayoutConnected (reads FileViewer context for status bar)
       └─ AppLayout (structural shell — owns resize + collapse state)
            ├─ TitleBar (dropdown menus, notifications, context-layer progress)
            ├─ ActivityBar (far-left 40px icon strip, never collapses)
            ├─ Sidebar (left, file tree / search / git / extensions)
            ├─ CentrePane (editor tab bar + content)
            ├─ TerminalPane (bottom, collapsible)
            ├─ AgentMonitorPane (right sidebar — chat, monitor, git, analytics)
            └─ StatusBar (git branch, file info, layout switcher, LSP status)
```

## Key Files

| File                                     | Role                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppLayout.tsx`                          | Structural shell — assembles panels, owns `useResizable` + `usePanelCollapse` state, handles DOM panel events                                                                              |
| `InnerAppLayout.tsx`                     | Wiring layer — wraps AppLayout with providers (FileViewerManager, MultiBufferManager, DiffReviewProvider), resolves all slots, renders overlays (CommandPalette, FilePicker, SymbolSearch) |
| `AppLayoutConnected.tsx`                 | Thin bridge — reads FileViewerManager context for status bar data, passes to AppLayout                                                                                                     |
| `TitleBar.tsx`                           | Window title bar — draggable region, dropdown menus (File/Edit/View/Go/Terminal/Help), notification center, context-layer progress indicator                                               |
| `EditorContent.tsx`                      | Centre pane content — file viewer, multi-buffer view, action bars, split editor support                                                                                                    |
| `RightSidebarTabs.tsx`                   | Right sidebar — chat-dominant with view switcher dropdown (monitor/git/analytics), thread history panel                                                                                    |
| `EditorTabBar.tsx`                       | Tab bar for open files + multi-buffer tabs, split editor button                                                                                                                            |
| `ActivityBar.tsx`                        | VS Code-style 40px icon strip — files/search/git/extensions. Clicking active icon toggles sidebar; clicking inactive switches view and expands                                             |
| `Sidebar.tsx`                            | Left sidebar container — header slot + content slot, collapse/expand chevron                                                                                                               |
| `CentrePane.tsx`                         | Simple flex container — tab bar slot + content area                                                                                                                                        |
| `TerminalPane.tsx`                       | Bottom panel — tab management via TerminalTabs, collapses to 32px header-only strip                                                                                                        |
| `AgentMonitorPane.tsx`                   | Right sidebar container — no own header (RightSidebarTabs owns it); `CollapsedAgentStrip` renders when collapsed                                                                           |
| `StatusBar.tsx`                          | 24px bottom bar — git branch, file path, line count, language, layout switcher, LSP status                                                                                                 |
| `useResizable.ts`                        | Pointer-drag resize hook — accent preview line during drag (panels frozen), snaps on `pointerup`, persists to localStorage + electron-store                                                |
| `usePanelCollapse.ts`                    | Collapse state hook — toggle/expand/collapse per panel, keyboard shortcuts, persists to localStorage                                                                                       |
| `ResizeDivider.tsx` / `ResizeHandle.tsx` | 5px drag handles with accent highlight on hover/active                                                                                                                                     |
| `SidebarSections.tsx`                    | Default sidebar content — file tree + outline/bookmarks/timeline collapsible sections                                                                                                      |
| `SidebarSection.tsx`                     | Generic collapsible section component used by SidebarSections                                                                                                                              |
| `LayoutSwitcher.tsx`                     | Workspace layout save/switch dropdown (floats above status bar)                                                                                                                            |
| `StatusBarControls.tsx`                  | Barrel re-export — implementation split into `.actions.tsx` (interactive controls) and `.shared.tsx` (primitives)                                                                          |
| `LspStatus.tsx`                          | LSP server status indicator embedded in StatusBar                                                                                                                                          |
| `IdeToolBridge.tsx`                      | Mounts inside LayoutProviders — bridges IDE tool calls from agent into editor actions                                                                                                      |

## Slot-Based Composition

`AppLayout` is fully slot-driven via `AppLayoutSlots` — zero business logic in the structural shell:

| Slot                 | Type                                      | Filled by                                     |
| -------------------- | ----------------------------------------- | --------------------------------------------- |
| `sidebarHeader`      | `ReactNode`                               | ProjectPicker                                 |
| `sidebarContent`     | `ReactNode`                               | SidebarSections (files view default)          |
| `sidebarViewContent` | `Partial<Record<SidebarView, ReactNode>>` | SearchPanel, GitSidebarPanel, ExtensionsPanel |
| `sidebarViewHeaders` | `Partial<Record<SidebarView, ReactNode>>` | Plain `<span>` headers per view               |
| `editorTabBar`       | `ReactNode`                               | EditorTabBar                                  |
| `editorContent`      | `ReactNode`                               | CentrePaneConnected                           |
| `agentCards`         | `ReactNode`                               | AgentSidebarContent (wraps RightSidebarTabs)  |
| `terminalContent`    | `ReactNode`                               | TerminalManager                               |

## Panel State

**Resize** (`useResizable`):

- Panels: `leftSidebar`, `rightSidebar`, `terminal`
- Defaults: 220 / 300 / 280 px. Min: 140 / 200 / 120. Max: 480 / 600 / 600
- Drag shows a `position:fixed; z-index:9999` preview line; panel snaps on `pointerup`
- `rightSidebar` and `terminal` use sign `-1` (dragging left/up grows them)
- Persisted to `localStorage` key `agent-ide:panel-sizes` and `electron-store` key `panelSizes`
- Double-click a divider to `resetSize()` to default

**Collapse** (`usePanelCollapse`):

- Default shortcuts: `Ctrl+B` (sidebar), `Ctrl+J` (terminal), `Ctrl+\` (right sidebar)
- Overridable via `keybindings` prop — action IDs: `view:toggle-sidebar`, `view:toggle-terminal`, `view:toggle-agent-monitor`
- Persisted to `localStorage` key `agent-ide:panel-collapse`
- Right sidebar uses `display:none` instead of unmounting — preserves streaming chat state

## DOM Events Consumed

`AppLayout` listens for `CustomEvent`s dispatched on `window` (renderer-only — **not** Electron IPC):

| Event                                                      | Action                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `agent-ide:toggle-sidebar`                                 | Toggle left sidebar                                             |
| `agent-ide:toggle-terminal`                                | Toggle terminal                                                 |
| `agent-ide:toggle-agent-monitor`                           | Toggle right sidebar                                            |
| `agent-ide:open-agent-chat` / `agent-ide:focus-agent-chat` | Expand right sidebar + set focus                                |
| `agent-ide:focus-terminal-session` (`{ sessionId }`)       | Expand terminal, activate or create session via `focusOrCreate` |
| `agent-ide:open-chat-in-terminal` (`{ claudeSessionId }`)  | Spawn `claude --resume <id>` session in terminal                |
| `agent-ide:apply-layout` (`WorkspaceLayout`)               | Apply saved panel sizes + collapse state atomically             |

Event name constants live in `../../hooks/appEventNames`. Never dispatch these from main process — use IPC for cross-process signals.

## Gotchas

- **Right sidebar is never unmounted when collapsed** — `display:none` is intentional. Unmounting destroys streaming chat state and model override selections. Do not change this.
- **`ChatErrorBoundary` is inline in `InnerAppLayout.tsx`** — intentionally not imported from shared modules. Vite HMR can fail to resolve shared modules exactly when crash recovery is needed.
- **TerminalPane collapsed height is 32px, not 0** — the header/tab row stays visible.
- **ActivityBar never collapses** — always visible, slightly dimmed (`filter: brightness(0.92)`) when sidebar is closed. Clicking the active icon toggles the sidebar; clicking an inactive icon switches view and expands.
- **`StatusBarControls` is split across three files** — avoids hitting ESLint complexity limits. Always re-export through the `.tsx` barrel.
- **Resize sign convention** — `rightSidebar` and `terminal` use `-1` because their resize handles are on the opposite edge (dragging left/up must grow them, not shrink).
- **`agent-ide:apply-layout` is atomic** — it calls both `applySizes` and `applyState` in the same handler so panels don't flash to an intermediate collapsed-but-wrong-size state.

## Dependencies

| Direction   | Module                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Consumes    | `FocusContext`, `ToastContext`, `ProjectContext`                                        |
| Consumes    | `FileViewer` — FileViewerManager, MultiBufferManager, DiffReviewProvider                |
| Consumes    | `Terminal` — TerminalManager, TerminalTabs, TerminalSession                             |
| Consumes    | `AgentChat` — AgentChatWorkspace, ChatHistoryPanel                                      |
| Consumes    | `AgentMonitor`, `GitPanel`, `Analytics`, `CommandPalette`, `ExtensionStore`, `McpStore` |
| Consumes    | `../../hooks/appEventNames`, `../../types/electron` (WorkspaceLayout, PanelSizes)       |
| Consumed by | `App.tsx` (renderer root) via `InnerAppLayout` only                                     |

<!-- claude-md-auto:end -->
