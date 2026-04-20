# ChatOnlyShell — Immersive single-column chat interface (Wave 42)

## Architecture Summary

A dedicated renderer shell that replaces `InnerAppLayout` when immersive chat mode is active. The backend is unchanged — same session store, same threads, same PTY, same hooks pipe. All chat features carry over automatically because they live inside `AgentChatWorkspace`.

```
ChatOnlyShell
  ├─ ChatOnlyTitleBar     — drag region, project name, Chat Mode badge, drawer toggle, Exit button, window controls
  ├─ ChatOnlySessionDrawer — off-canvas left drawer (CSS transform slide-in), mounts SessionSidebar
  ├─ AgentChatWorkspace   — full-width, centered max-w-4xl, carries all chat functionality
  ├─ ChatOnlyStatusBar    — git branch, active-session token usage, pending-diff button
  └─ ChatOnlyDiffOverlay  — full-screen modal overlay mounting DiffReviewPanel (Phase D wires state)
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

## Phase Roadmap

- **Phase A** (this directory): component tree, tests, CLAUDE.md. Not yet wired into App.tsx.
- **Phase B**: `App.tsx` integration, `ChatOnlyShellWrapper` with providers, mount condition.
- **Phase C**: Config schema, Settings toggle, keyboard shortcut, View menu entry.
- **Phase D**: `ChatOnlyDiffOverlay` wired to `useDiffReview()` pending count; status bar diff button active.
- **Phase E**: Integration tests, docs updates.
