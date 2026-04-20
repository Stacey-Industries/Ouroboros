# ChatOnlyShell — Immersive single-column chat interface (Wave 42–44)

## Architecture Summary

A dedicated renderer shell that replaces `InnerAppLayout` when immersive chat mode is active. The backend is unchanged — same session store, same threads, same PTY, same hooks pipe. All chat features carry over automatically because they live inside `AgentChatWorkspace`.

**Wave 44 parity pass (Claude desktop / Piebald targets):**
- Shell root uses `h-screen w-screen` (not `h-full w-full`) so it fills the viewport — `#root` / `body` have no explicit height, so `h-full` would resolve to content-height.
- `--surface-chat` inherits the active IDE theme's `colors.bg` unconditionally. Glass theme stays transparent (Mica pass-through is the baseline for chat mode); opaque themes stay opaque. No runtime override.
- **Persistent `ChatHistorySidebar`** replaces the old SessionSidebar overlay. Three modes: `pinned` (280px, default), `collapsed` (48px icon rail), `hidden` (falls back to `ChatOnlySessionDrawer` overlay). Mode cycles via the title-bar toggle button and persists in `config.layout.chatSidebarMode`.
- **`ChatOnlyUserMenu`** in sidebar footer: popover with Settings (Ctrl+,), theme toggle, Keyboard shortcuts (Ctrl+/), Command palette (Ctrl+K), Exit chat mode, Log out stub.
- **Shell-level overlays:** `ChatOnlySettingsOverlay`, `KeyboardShortcutCheatSheet`, `CommandPalette`. All reachable via keyboard shortcuts from chat-only.
- **`ChatStatusChipRow`** (Phase D): Piebald-style thin chip strip mounted below the composer in chat-only mode. Model + permission chips live here, NOT in the title bar (avoids drag-region / portaled-popover issues).
- **Title bar is minimal**: sidebar-pin toggle, project name, drag spacer, Exit chat mode button, window controls.
- AgentChat store is lifted to shell level so the sidebar + menu (outside `AgentChatWorkspace`) share state with the workspace.

**Wave 43 polish (baseline, still applies):**
- Composer wrapped in `FloatingComposerContainer` (pill surface, `data-layout="floating-composer"`).
- `AgentChatWorkspace` receives `variant="chat-only"` — suppresses `SideChatDrawer` and `BranchCompareModal`.
- Streaming rAF-batched via `useRafBatchedChunks` — single `setStateMap` per animation frame.

```
ChatOnlyShell (h-screen w-screen, bg-surface-chat)
  ├─ ChatOnlyTitleBar           — sidebar-pin toggle, project, drag spacer, exit btn, window controls
  ├─ ChatOnlyBody (horizontal row)
  │    ├─ ChatHistorySidebar    — pinned 280px | collapsed 48px rail | hidden (drawer fallback)
  │    │     ├─ SidebarHeader   — search input + "+ New chat"
  │    │     ├─ ChatHistoryList — threads grouped by project, pinned section at top, status dots
  │    │     └─ ChatOnlyUserMenu — avatar trigger + popover (Settings, theme, shortcuts, exit, logout)
  │    └─ <main>
  │          └─ AgentChatWorkspace (variant="chat-only")
  │               ├─ FloatingComposerContainer (pill)
  │               └─ ChatStatusChipRow  — model + permission chips (below composer)
  ├─ ChatOnlyStatusBar          — conditional null at rest
  ├─ ChatOnlyDiffOverlay        — full-screen diff review
  ├─ ChatOnlySettingsOverlay    — modal host for SettingsModal (Ctrl+,)
  ├─ KeyboardShortcutCheatSheet — overlay (Ctrl+/)
  └─ CommandPalette             — shell-level (Ctrl+K)
```

## Mount Condition

`ChatOnlyShell` is mounted by `InnerApp` (in `App.tsx`) when:

```ts
const isImmersive = isChatWindow || immersiveFlag;
```

- `isChatWindow` — window opened as `?mode=chat` (Wave 20 pop-out path)
- `immersiveFlag` — `config.layout.immersiveChat === true` (toggled in Settings / Ctrl+Shift+I)

When `isImmersive` is false, `InnerAppLayout` mounts instead (existing IDE shell). The flag integration is wired in **Phase B**.

## Provider Expectations

`ChatOnlyShell` expects the following providers to be mounted by its ancestor (`InnerApp` / `ConfiguredApp`):

| Provider | Where mounted | Used by |
|---|---|---|
| `ProjectProvider` | `ConfiguredApp` | `useProject()` in TitleBar, StatusBar |
| `AgentEventsProvider` | `ConfiguredApp` | `useAgentEventsContext()` in StatusBar |
| `DiffReviewProvider` | `ChatOnlyShellWrapper` (Phase B) | `useDiffReview()` in DiffOverlay |
| `FileViewerManager` | `ChatOnlyShellWrapper` (Phase B) | AgentChatWorkspace internals |
| `MultiBufferManager` | `ChatOnlyShellWrapper` (Phase B) | AgentChatWorkspace internals |
| `ToastProvider` | `ConfiguredApp` | Toast notifications |

## IdeToolBridge Exclusion

`IdeToolBridge` is **intentionally not mounted** in `ChatOnlyShell`. IDE-context tool queries (`getOpenFiles`, `getActiveFile`, `getSelection`, `getUnsavedContent`, `getTerminalOutput`) return empty. This matches Claude desktop's behaviour — the chat-only shell has no open editor state to report. Cross-window IDE-tool delegation is a Wave 43+ candidate.

## DOM Events

| Event | Direction | Handler |
|---|---|---|
| `agent-ide:toggle-session-drawer` | inbound | Toggles `drawerOpen` state |
| `agent-ide:toggle-immersive-chat` | outbound | Dispatched by Exit button; handled by `useImmersiveChatFlag` (Phase C) |

## Phase Roadmap (complete as of Wave 43)

- **Wave 42 Phase A**: component tree, tests, CLAUDE.md. Initial shell scaffolded.
- **Wave 42 Phase B**: `App.tsx` integration, `ChatOnlyShellWrapper` with providers, mount condition.
- **Wave 42 Phase C**: Config schema, Settings toggle, keyboard shortcut, View menu entry.
- **Wave 42 Phase D**: `ChatOnlyDiffOverlay` wired to `useDiffReview()` pending count; status bar diff button active.
- **Wave 42 Phase E**: Integration tests, docs updates.
- **Wave 43 Phase C**: Chrome strip — removed `ChatModeBadge` + Exit button, added `ChatOnlyHeaderControls`.
- **Wave 43 Phase D**: `FloatingComposerContainer`, `--surface-user-bubble` token, status bar conditional null.
- **Wave 43 Phase E**: Unified `ASSISTANT_GUTTER`, flat tool cards in chat-only mode, density-aware spacing.
- **Wave 43 Phase F**: `useRafBatchedChunks` — single `setStateMap` per animation frame during streaming.
- **Wave 43 Phase G**: Integration test (`ChatOnlyShell.polish.integration.test.tsx`), CLAUDE.md updates.
