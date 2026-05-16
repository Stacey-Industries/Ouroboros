# ChatOnlyShell — Immersive chat shell + workbench variant (Wave 42–89)

## Architecture Summary

A dedicated renderer shell that replaces `InnerAppLayout` when immersive chat mode is active. The backend is unchanged — same session store, same threads, same PTY, same hooks pipe. All chat features carry over automatically because they live inside `AgentChatWorkspace`.

**Wave 46 chat-workbench variant (as evolved through Wave 89):**
- `layout.chatWorkbench` gates a workstation-style chat shell without mounting the full IDE shell.
- `ChatWorkbenchShell` keeps the conversation central with one persistent docked surface (`WorkbenchRail`) and a bottom terminal dock. Secondary surfaces (`ChatWorkbenchArtifactPane`, `ChatWorkbenchUtilityDrawer`) render as non-modal **overlays** anchored to the chat area (Wave 89 — see `OverlayDrawer.tsx`), not as fixed-flex body siblings.
- `ChatWorkbenchTerminalDock` (Wave 89) hosts **two stacked terminal slots** — `primary` (Wave 90 home for interactive Claude; generic terminal in 89) and `secondary` (dev shell) — separated by a sibling-resizable divider via `useResizable.startSiblingResize`. Each slot owns an independent `useTerminalSessions` instance.
- The utility drawer auto-opens on new approvals, new diff-review sessions, and `agent-ide:open-subagent-panel` events (unchanged from Wave 47). Artifact pane auto-opens on diff events (unchanged).
- Both overlays support concurrent open. Tile layout: artifact pane anchored to the chat-area right edge; utility drawer anchored to the left of the artifact pane when both open.

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

## IdeToolBridge and Terminal Tool Bridge

`IdeToolBridge` (the full IDE bridge) is **intentionally not mounted** in `ChatOnlyShell`. It depends on `useFileViewerManager()` which is not available in the ChatOnly scope (Wave 42 design intent).

Instead, **Wave 88 Phase 4** adds a scoped `ChatOnlyTerminalToolBridge` mounted directly in `ChatWorkbenchShell`. It handles:

- `getTerminalOutput` — routes to the dock's **currently-active** session (`terminal.activeSessionId`), not the first-registered terminal fallback that `getTerminalLines(undefined)` would return. Returns `[]` when no dock session is active.
- `getOpenFiles`, `getActiveFile`, `getUnsavedContent`, `getSelection` — respond with `(null, 'unavailable in chat-only mode')` so the chat agent can distinguish this from a transport error.
- Unknown methods — respond with a structured `'Unknown method in chat-only mode: <method>'` envelope.

The bridge has no DOM output (`returns null`) and does not call `useFileViewerManager()` or `useProject()`. See Wave 88 Decision 3 (`roadmap/wave-88-terminal-foundation/wave-88-decisions.md`) for the architectural rationale.

Cross-window IDE-tool delegation remains deferred (see `roadmap/follow-ups/` for the `cross-window-ide-tool-delegation` ticket).

## DOM Events

| Event | Direction | Handler |
|---|---|---|
| `agent-ide:toggle-session-drawer` | inbound | Toggles `drawerOpen` state |
| `agent-ide:toggle-immersive-chat` | outbound | Dispatched by Exit button; handled by `useImmersiveChatFlag` (Phase C) |

## Wave 89 composition (current)

```
ChatWorkbenchShell
  ├─ ChatOnlyTitleBar
  ├─ ChatWorkbenchBody                 — flex row: rail | chat-area | (terminal-dock below)
  │    ├─ WorkbenchRail                — grouped: active / background / recent-chat; open by default
  │    └─ chat-area (position: relative — overlay anchor)
  │         ├─ AgentChatWorkspace      — primary, variant="chat-only"
  │         ├─ ChatWorkbenchComparePane — inspect-only secondary pane, optional
  │         └─ ChatWorkbenchOverlays   — two OverlayDrawer instances anchored here
  │              ├─ ChatWorkbenchArtifactPane (overlay, default width 480)
  │              └─ ChatWorkbenchUtilityDrawer (overlay, default width 380, tiles LEFT of artifact when both open)
  │                   ├─ WorkbenchApprovalPanel
  │                   ├─ DiffReviewPanel
  │                   └─ WorkbenchTimelinePanel
  ├─ ChatWorkbenchTerminalDock         — two stacked slots, sibling-resizable
  │    ├─ DockSlot (slot='primary')    — Wave 90 interactive-claude home
  │    └─ DockSlot (slot='secondary')  — dev shell
  └─ existing shell overlays (settings, shortcuts, command palette, diff overlay)
```

Pre-Wave-89 composition: `ChatWorkbenchArtifactPane` and `ChatWorkbenchUtilityDrawer` were fixed-flex siblings inside `ChatWorkbenchBody` (occupied permanent width). Mobile path (`MobileOverlays` in `ChatWorkbenchBody.tsx`) still renders both inside `MobileOverlay` modal wrappers — unchanged.

The workbench shell still does **not** mount `IdeToolBridge`, `RightSidebarTabs`, `CentrePaneConnected`, or arbitrary split-pane editor chrome. Reuse stays selective: `FileViewer`, `DiffReview`, `TerminalManager`, and approval/session contexts are mounted through the existing providers in `ChatOnlyShellWrapper`.

## Phase Roadmap

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
- **Wave 46 Phase A-D**: workbench shell scaffold, session-first rail, terminal dock, artifact pane.
- **Wave 46 Phase E**: `ChatWorkbenchUtilityDrawer` replaces the placeholder drawer with approvals, review, activity, and subagent tabs.
- **Wave 46 Phase F**: integration coverage for drawer auto-open flows and docs updates.
- **Wave 47 Phase A**: `WorkbenchRail` session-first IA — grouped active/background/recent-chat sections, distinct "New session" and "Launch agent" buttons, `useWorkbenchAttention` for derived attention state, `useWorkbenchSessionActivation` for real activation bridge.
- **Wave 47 Phase B**: adaptive surface policy (`useWorkbenchSurfacePolicy`), artifact history stack (`useArtifactHistoryStack`), `ArtifactHistoryList`, layout persistence via `useChatWorkbenchLayout`.
- **Wave 47 Phase C**: timeline inspector (`useWorkbenchTimeline` decomposed into `.entries.ts` + `.helpers.ts`), `WorkbenchTimelinePanel`, subagent transcript drill-in (later consolidated into the `monitor` tab via `useWorkbenchSurfacePolicy`; Wave 93 removed the dead component), deferred agent-end model.
- **Wave 47 Phase D**: side-by-side compare — `ChatWorkbenchComparePane` with scoped isolated store (`useScopedWorkbenchWorkspace`), `useWorkbenchCompare` for eligibility and target state, compare affordance in `WorkbenchRail`.
- **Wave 47 Phase E**: sandboxed HTML preview — `HtmlPreview.tsx` using strict `<iframe srcDoc sandbox="">`, `ContentRouter` routing, `useFileViewerState` `isHtml` derivation.
- **Wave 47 Phase F**: integration coverage (`ChatWorkbenchFollowThrough.integration.test.tsx`), rail default open, docs updates.
- **Wave 89 Phase 0**: `useResizable.sibling.ts` adds sibling-stack drag math via `startSiblingResize`; `dockPersistenceSchema.ts` adds `terminalDockSlots`, `overlayDrawerWidth`, `artifactOverlayWidth` with legacy-`dockHeight` forward migration. Defaults `{ primary: 160, secondary: 100 }` (tuned in Phase 1 revision to fit under `TERMINAL_DEFAULT_SIZE` 280 with header chrome).
- **Wave 89 Phase 1**: Two-slot stacked terminal dock — `DockSlot.tsx` per-slot component with its own `useTerminalSessions`, `useDockSlotHeights` persistence orchestration, `SPLIT_TERMINAL_EVENT` payload extended with `{ slot, sessionId }` (legacy dispatch sites default to `'primary'` via `?? 'primary'` fallback in `TerminalManager`). Phase 1 revision (commit `7ceca999`): routed `useDockSlotHeights` drag through `startSiblingResize` via an additive `onCommit` callback on `SiblingResizeOpts` — single resize source of truth restored per ADR Decision 1.
- **Wave 89 Phase 2**: `OverlayDrawer.tsx` — non-modal slide-in primitive, anchored to nearest positioned ancestor (NOT viewport), z-index 200, `rgba(0,0,0,0.35)` backdrop (mica/vibrancy-safe override of ADR Decision 4's token tint), window-scoped Escape with `stopPropagation` (jsdom div-scoped handlers don't propagate reliably).
- **Wave 89 Phase 3**: Utility drawer + artifact pane migrated from fixed-flex slots to `OverlayDrawer` instances. `ChatWorkbenchOverlays.tsx` is the mount point. `useOverlayDrawerWidths` hook persists widths per surface. `ChatWorkbenchBody`'s desktop flex tree simplified to `rail | chat-area | terminal-dock`. `useChatWorkbenchLayout` mutual-exclusion removed (both overlays can be concurrently open). `useWorkbenchSurfacePolicy` unchanged (state-only, no overlay-specific rewiring needed).
