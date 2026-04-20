# ChatOnlyShell — Immersive single-column chat interface (Wave 42–43)

## Architecture Summary

A dedicated renderer shell that replaces `InnerAppLayout` when immersive chat mode is active. The backend is unchanged — same session store, same threads, same PTY, same hooks pipe. All chat features carry over automatically because they live inside `AgentChatWorkspace`.

**Wave 43 polish (Phases C–F):**
- Unified background: root and title bar both use `bg-surface-chat` — no visual seam.
- Title bar: no `border-b` divider; `ChatModeBadge` removed; "Exit chat mode" button removed (moved to View menu). Model + permission chips now live in `ChatOnlyHeaderControls` mounted inline in the title bar.
- Status bar: returns `null` when there is no git branch, no active streaming sessions, and no pending diffs — zero chrome at rest.
- Composer: wrapped in `FloatingComposerContainer` (pill surface, `data-layout="floating-composer"`).
- `AgentChatWorkspace` receives `variant="chat-only"` — suppresses `SideChatDrawer` and `BranchCompareModal`.
- Streaming: rAF-batched via `useRafBatchedChunks` — single `setStateMap` per animation frame.

```
ChatOnlyShell
  ├─ ChatOnlyTitleBar     — drag region, project name, drawer toggle, ChatOnlyHeaderControls, window controls
  │                          (no border-b, no ChatModeBadge, no Exit button)
  ├─ ChatOnlySessionDrawer — off-canvas left drawer (CSS transform slide-in), mounts SessionSidebar
  │                          Backdrop uses --surface-scrim-chat token
  ├─ AgentChatWorkspace   — full-width, centered max-w-4xl, variant="chat-only"
  │                          (SideChatDrawer + BranchCompareModal NOT mounted)
  │    └─ FloatingComposerContainer — pill wrapper, data-layout="floating-composer"
  ├─ ChatOnlyStatusBar    — conditional: null when idle; shows branch/tokens/diffs when active
  └─ ChatOnlyDiffOverlay  — full-screen modal overlay mounting DiffReviewPanel
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
