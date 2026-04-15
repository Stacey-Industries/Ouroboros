# Wave 20 — Chat-Primary Layout & Session Sidebar
## Implementation Plan

**Version target:** v1.5.1 (minor — major new view mode)
**Feature flag:** `layout.chatPrimary` (default `false` until Phase E soak)
**Dependencies:** Wave 16 (Session primitive), Wave 17 (layout preset engine)

---

## Overview

Wave 20 is the critical-path user-visible deliverable of the dual-mode roadmap.
It converts the chat-primary preset from a Wave 17 scaffold into a fully functional
second layout mode, adds a session sidebar for parallel work visibility, and exposes
keyboard shortcuts to toggle between layouts.

---

## Phase A — Foundation (this wave)

**Goal:** SessionSidebar component tree + chat-primary preset fully populated +
basic preset switching. The session store gains an IPC surface; the renderer gains
a live session list.

### New files

| File | Lines | Description |
|------|-------|-------------|
| `src/renderer/components/SessionSidebar/SessionSidebar.tsx` | ~140 | Top-level sidebar panel |
| `src/renderer/components/SessionSidebar/SessionRow.tsx` | ~80 | Single session row |
| `src/renderer/components/SessionSidebar/SessionGroupHeader.tsx` | ~40 | Group by project root |
| `src/renderer/components/SessionSidebar/NewSessionButton.tsx` | ~60 | Create session CTA |
| `src/renderer/components/SessionSidebar/useSessions.ts` | ~80 | Hook: list + subscribe |
| `src/renderer/components/SessionSidebar/index.ts` | ~10 | Barrel export |
| `src/renderer/components/SessionSidebar/SessionSidebar.test.tsx` | ~60 | Vitest jsdom |
| `src/main/ipc-handlers/sessionCrud.ts` | ~130 | sessions:list/create/activate/archive/delete |
| `src/main/ipc-handlers/sessionCrud.test.ts` | ~100 | 10+ tests |
| `src/renderer/types/electron-session.d.ts` | ~60 | SessionCrudAPI interface |
| `src/renderer/components/Layout/layoutPresets/componentRegistry.ts` | ~60 | componentKey → ReactNode |
| `src/renderer/components/Layout/layoutPresets/componentRegistry.test.ts` | ~40 | Registry resolution tests |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/layoutPresets/presets.ts` | Fill chatPrimaryPreset slots |
| `src/renderer/types/electron-workspace.d.ts` | Add `sessionCrud: SessionCrudAPI` to ElectronAPI |
| `src/renderer/types/electron.d.ts` | Re-export electron-session.d.ts |
| `src/preload/preloadSupplementalApis.ts` | Wire sessionCrudApi slice |
| `src/main/ipc-handlers/index.ts` | Export registerSessionCrudHandlers |
| `src/main/ipc.ts` | Register sessionCrud domain |
| `src/renderer/App.tsx` | Add Ctrl+Shift+L / Cmd+Shift+L toggle shortcut |
| `src/renderer/components/Layout/InnerAppLayout.tsx` | Wire SessionSidebar into chat-primary slot |

### IPC channels (new)

| Channel | Direction | Description |
|---------|-----------|-------------|
| `sessionCrud:list` | invoke | Return all sessions from sessionStore |
| `sessionCrud:active` | invoke | Return active session for this window |
| `sessionCrud:create` | invoke | Create + upsert + return new session |
| `sessionCrud:activate` | invoke | Set activeSessionId for window |
| `sessionCrud:archive` | invoke | Archive session by id |
| `sessionCrud:delete` | invoke | Delete session by id |
| `sessionCrud:changed` | push | Emitted by main whenever store mutates |

**Note:** Channels are namespaced `sessionCrud:*` (not `sessions:*`) to avoid
colliding with the existing `sessions:save/load/export/delete` channels from
`ipc-handlers/sessions.ts` (file-persistence-only handlers).

### Preset changes

`chatPrimaryPreset.slots`:
- `editorContent`: `'AgentChatWorkspace'`
- `sidebarContent`: `'SessionSidebar'`
- `agentCards`: `'AgentSidebarContent'`
- `terminalContent`: `'TerminalManager'`

`chatPrimaryPreset.panelSizes`:
- `leftSidebar`: 260 (wider for session list)
- `rightSidebar`: 480 (wider chat column)
- `terminal`: 200 (compressed — chat is primary)

`chatPrimaryPreset.visiblePanels`:
- `leftSidebar`: true
- `rightSidebar`: true
- `terminal`: false (collapsed by default in chat mode)

### Component registry

`componentRegistry.ts` maps componentKey strings to factory functions.
Initial entries: `SessionSidebar`, `AgentChatWorkspace`, `TerminalManager`,
`FileViewerManager`, `AgentCards`, `SidebarSections`, `CentrePaneConnected`,
`AgentSidebarContent`, `ProjectPicker`, `EditorTabBar`.

The `LayoutPresetResolverProvider` (Wave 17) is a data layer; Phase A adds a
`useComponentRegistry()` hook that `InnerAppLayout` uses to swap slots.

### Keyboard shortcut

`Ctrl+Shift+L` / `Cmd+Shift+L` in `App.tsx` dispatches
`agent-ide:toggle-layout-mode` DOM event, which `AppLayout` handles to toggle
between `ide-primary` and `chat-primary` by updating `Session.layoutPresetId`
and re-reading via `useLayoutPreset()`.

---

## Phase B — Dedicated Chat Window

**Goal:** Optional secondary BrowserWindow running the chat-primary preset,
bound to a session. Toggle via View menu and `Ctrl+Shift+O`.

### Approach

1. Add `window:openChatWindow(sessionId)` IPC in `windowManager.ts`.
2. New BrowserWindow loads the same renderer but with a `?mode=chat&session=<id>`
   query param that switches layout mode at boot.
3. Session is the shared primitive — both windows read from sessionStore.
4. Thread state shared via existing `agentChat` store (already per-session keyed).

### Files

| File | Change |
|------|--------|
| `src/main/windowManager.ts` | `openChatWindow(sessionId)` — secondary window factory |
| `src/main/ipc-handlers/app.ts` | `window:openChatWindow` handler |
| `src/renderer/index.tsx` | Read `?mode=chat` query param; pass to App |
| `src/renderer/App.tsx` | Accept `chatMode` prop; boot into chat-primary preset |
| `src/main/menu.ts` | View menu → "Open Chat Window" item |

---

## Phase C — AgentMonitor Integration

**Goal:** Default collapsible right drawer with Verbose/Normal/Summary view modes.
Per-session opt-in to surface selected event types inline in chat.

### Approach

1. Extend `Session.agentMonitorSettings` with `{ viewMode, inlineEventTypes[] }`.
2. Add `ViewModeSelector` in `AgentMonitorPane`.
3. `AgentChatWorkspace` reads `inlineEventTypes` from session and renders
   `InlineEventCard` for matching events (pre_tool_use for edit/write,
   post_tool_use_failure, user_prompt_submit, notification).
4. Noisy event types (file_changed, cwd_changed) default to drawer-only.
5. View-mode preference captured via Wave 15 telemetry.

---

## Phase D — Accessibility Pass

**Goal:** Full keyboard-nav audit of AgentChatWorkspace and SessionSidebar.
Screen-reader labels on streaming tool cards. Focus management on session switch.

### Approach

1. axe-core scan via vitest-axe integration.
2. Manual Tab/Arrow/Enter audit checklist against every interactive element.
3. `aria-label` on all icon buttons, streaming state transitions via `aria-live`.
4. `useFocusTrap` pattern for modal flows (NewSessionButton project picker).
5. Focus restore on session switch — `activeRef.current?.focus()`.

---

## Phase E — Virtualized List + Filters + Archive GC

**Goal:** Sidebar scales to 50+ sessions. Status/project/worktree filters.
Session archive with 7-day trash grace period. Lazy GC task.

### Approach

1. Virtualize with `react-virtual` when session count > 20 (mirrors
   `VirtualizedMessageList` in AgentChatWorkspace).
2. Filter bar: status (active/archived/queued/errored), project, worktree state.
3. Session archive → move to `.trash/` directory; 7-day grace period before
   worktree removal.
4. GC task: on app startup + weekly interval, purge archived sessions whose
   `archivedAt` > 7 days ago.
5. One-click restore from trash — `sessionCrud:restore` IPC channel.
6. After Phase E dogfood, flip `layout.chatPrimary` default to `true`.

---

## Acceptance Criteria (Phase A)

- [ ] `chatPrimaryPreset.slots` all populated — no TODO comments remain
- [ ] `SessionSidebar` renders sessions grouped by project root
- [ ] `useSessions` subscribes to `sessionCrud:changed` for live updates
- [ ] `Ctrl+Shift+L` toggles between `ide-primary` and `chat-primary`
- [ ] `layout.chatPrimary` flag gates the preset toggle (default `false`)
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — 0 errors
- [ ] All new test files pass

---

## Risks

| Risk | Mitigation |
|------|------------|
| Muscle memory break for ide-primary users | Flag stays off by default until Phase E soak |
| `sessions:*` namespace collision with existing file-persistence handlers | Use `sessionCrud:*` namespace for new store-based channels |
| Component registry creates tight coupling between preset data and renderer | Registry is renderer-only; presets stay JSON-serialisable |
| Session sidebar performance at scale | Phase E virtualizes > 20 sessions |

---

## Exit Criteria (Full Wave 20)

- 2-week author dogfood with chat-primary as daily driver.
- Feature flag default flipped to `on` after dogfood with no regressions.
- `docs/` updated describing both layouts.
- axe-core scan on chat-primary: 0 violations (Phase D).
