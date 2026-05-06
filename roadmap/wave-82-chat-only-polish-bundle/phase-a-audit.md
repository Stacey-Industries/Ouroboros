# Wave 82 — Phase A Architect Audit

Read-only deliverable. Produced by `sonnet-architect` on 2026-05-03.
Consumed by: Phase D (wiring sweep), Phase E (diagnostic sprint), Phase F (diagnostic-driven implementation), Phase G (artifact pane).

---

## Section 1 — Workbench Title-Bar Wiring Matrix

**Source:** `src/renderer/components/Layout/TitleBar.workbench.menus.ts`

**Listener grep method:** `addEventListener.*<EVENT_CONSTANT>` across `src/renderer`, excluding `appEventNames.ts` and `out/` build artifacts.

**Action-type column key:**

- `native` = `document.execCommand` call, no event dispatch — works by browser contract
- `direct-call` = invokes a function directly inline (no DOM event involved)
- `dom-event` = `window.dispatchEvent(new CustomEvent(...))` — requires a matching `addEventListener`

**Handler availability key:**

- Handler name given = function exists today, subscription wiring is all that's needed
- `NO HANDLER — recommend menu item removal` = no implementation exists; remove the item rather than wire a no-op or fabricate new logic

---

### File Menu (`buildWorkbenchFileMenu` — `TitleBar.workbench.menus.ts:63–93`)

| Menu | Item label                     | Event constant                                   | Action type | Listener exists?                       | Recommended target                           | Existing handler to call                                                                                                                                                                                                                   |
| ---- | ------------------------------ | ------------------------------------------------ | ----------- | -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File | New Session                    | `WORKBENCH_NEW_SESSION_EVENT`                    | dom-event   | **No**                                 | `ChatWorkbenchShell` (`useShellState`)       | `handlers.handleCreateSession(layout.activeProject ?? undefined)` — `ChatWorkbenchBody.model.ts:124`. Alternative: redirect dispatch to `OPEN_MULTI_SESSION_EVENT` (already wired in `ChatWorkbenchShell.tsx:48`) to avoid prop-threading. |
| File | New Chat in Active Session     | `WORKBENCH_NEW_CHAT_EVENT`                       | dom-event   | **No**                                 | `ChatWorkbenchShell` (`useShellState`)       | `store.getState().onSelectThread(null)` via `useAgentChatStoreContext` — equivalent to `model.startNewChat()`                                                                                                                              |
| File | Open Project                   | `WORKBENCH_OPEN_PROJECT_EVENT`                   | dom-event   | **No**                                 | `ChatWorkbenchShell` or `TwoTierRailSurface` | Invoke `window.electronAPI.files.selectFolder()` then `addProjectRoot(path)` + `onAddProject(path)`; mirrors `OuterProjectRail.tsx:240–249`                                                                                                |
| File | Switch Project (submenu items) | `WORKBENCH_SWITCH_PROJECT_EVENT` (detail = path) | dom-event   | **No**                                 | `TwoTierRailSurface`                         | `railHandlers.handleSelectProject(event.detail)` → `layout.setActiveProject(path)` — `ChatWorkbenchBody.rails.tsx:61–63`                                                                                                                   |
| File | Exit Chat Mode                 | `TOGGLE_IMMERSIVE_CHAT_EVENT`                    | dom-event   | **Yes** — `useImmersiveChatFlag.ts:71` | Already wired                                | n/a                                                                                                                                                                                                                                        |

---

### Edit Menu (`buildWorkbenchEditMenu` — `TitleBar.workbench.menus.ts:95–116`)

| Menu | Item label    | Event constant                     | Action type | Listener exists?                      | Recommended target  | Existing handler to call                                                                                                                                         |
| ---- | ------------- | ---------------------------------- | ----------- | ------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit | Cut           | _(none)_                           | native      | **Yes** — browser built-in            | n/a                 | n/a                                                                                                                                                              |
| Edit | Copy          | _(none)_                           | native      | **Yes**                               | n/a                 | n/a                                                                                                                                                              |
| Edit | Paste         | _(none)_                           | native      | **Yes**                               | n/a                 | n/a                                                                                                                                                              |
| Edit | Find in Chat  | `WORKBENCH_OPEN_CHAT_SEARCH_EVENT` | dom-event   | **Yes** — `ChatWorkbenchShell.tsx:90` | Already wired       | n/a                                                                                                                                                              |
| Edit | Find Next     | `WORKBENCH_FIND_NEXT_EVENT`        | dom-event   | **No**                                | `ChatSearchOverlay` | **NO HANDLER — recommend menu item removal.** `ChatSearchOverlay` has no find-next implementation; building cursor-advancing search is out of this wave's scope. |
| Edit | Find Previous | `WORKBENCH_FIND_PREV_EVENT`        | dom-event   | **No**                                | `ChatSearchOverlay` | **NO HANDLER — recommend menu item removal.** Same reason as Find Next.                                                                                          |

---

### View Menu (`buildWorkbenchViewMenu` — `TitleBar.workbench.menus.ts:118–154`)

| Menu | Item label            | Event constant                          | Action type | Listener exists?                             | Recommended target                                           | Existing handler to call                                                                                                                             |
| ---- | --------------------- | --------------------------------------- | ----------- | -------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| View | Toggle Outer Rail     | `WORKBENCH_TOGGLE_OUTER_RAIL_EVENT`     | dom-event   | **No**                                       | `ChatWorkbenchShell` (`useShellState` has `layout` in scope) | `layout.toggleRail()` — `useChatWorkbenchLayout.ts:156`                                                                                              |
| View | Toggle Inner Sidebar  | `WORKBENCH_TOGGLE_INNER_SIDEBAR_EVENT`  | dom-event   | **No**                                       | `ChatWorkbenchShell`                                         | `layout.toggleRail()` — inner sidebar visibility is gated by the same `layout.railOpen` flag in current model. No separate inner-only toggle exists. |
| View | Toggle Utility Drawer | `WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT` | dom-event   | **No**                                       | `ChatWorkbenchShell`                                         | `layout.toggleUtility()` — `useChatWorkbenchLayout.ts:160`                                                                                           |
| View | Toggle Terminal Dock  | `WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT`  | dom-event   | **No**                                       | `ChatWorkbenchShell` (`useShellState` has `dock` in scope)   | `dock.toggleVisible()` — `useTerminalDockState.ts:55`                                                                                                |
| View | Toggle Artifact Pane  | `WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT`  | dom-event   | **No**                                       | `ChatWorkbenchShell`                                         | `layout.toggleArtifact()` — `useChatWorkbenchLayout.ts:158`                                                                                          |
| View | Exit Chat Mode        | `TOGGLE_IMMERSIVE_CHAT_EVENT`           | dom-event   | **Yes** (duplicate of File > Exit Chat Mode) | Already wired                                                | n/a                                                                                                                                                  |

---

### Tools Menu (`buildWorkbenchToolsMenu` — `TitleBar.workbench.menus.ts:156–174`)

| Menu  | Item label                | Event constant                                          | Action type | Listener exists?                                                                                                                                                                                                                                                              | Recommended target                                    | Existing handler to call                                                                                                                                                                                       |
| ----- | ------------------------- | ------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools | Settings                  | `OPEN_SETTINGS_PANEL_EVENT` (`agent-ide:open-settings`) | dom-event   | **No — wrong event.** `ChatOnlySettingsOverlay.tsx:30` listens for `OPEN_SETTINGS_EVENT` (`agent-ide:open-settings-modal`) — a **different** constant. `SettingsPanel.tsx:202` listens for `OPEN_SETTINGS_PANEL_EVENT` but `SettingsPanel` is not mounted in workbench shell. | `TitleBar.workbench.menus.ts:163` (fix dispatch site) | **One-line fix:** change dispatch from `OPEN_SETTINGS_PANEL_EVENT` to `OPEN_SETTINGS_EVENT`. The overlay listener already exists.                                                                              |
| Tools | Keyboard Shortcuts        | `OPEN_SETTINGS_PANEL_EVENT` with detail `'keybindings'` | dom-event   | **No — same mismatch**                                                                                                                                                                                                                                                        | `TitleBar.workbench.menus.ts:168`                     | Change dispatch to `OPEN_SETTINGS_EVENT`. Tab deep-link to keybindings not currently supported by `ChatOnlySettingsOverlay`/`SettingsModal` — opening settings is better than no-op; deep-link is a follow-up. |
| Tools | Theme (each submenu item) | `SET_THEME_EVENT` (`agent-ide:set-theme`)               | dom-event   | **Yes** — `useAppEventListeners.ts:176` (called from `InnerApp` in `App.tsx`, in ancestor tree above both shells)                                                                                                                                                             | Already wired                                         | n/a                                                                                                                                                                                                            |

---

### Help Menu (`buildWorkbenchHelpMenu` — `TitleBar.workbench.menus.ts:176–195`)

| Menu | Item label      | Event constant | Action type | Listener exists?                                                          | Recommended target | Existing handler to call |
| ---- | --------------- | -------------- | ----------- | ------------------------------------------------------------------------- | ------------------ | ------------------------ |
| Help | About Ouroboros | _(none)_       | direct-call | **Yes** — `showAbout()` invoked directly                                  | Already wired      | n/a                      |
| Help | Documentation   | _(none)_       | direct-call | **Yes** — `window.electronAPI?.app?.openExternal?.(url)` invoked directly | Already wired      | n/a                      |
| Help | Report Issue    | _(none)_       | direct-call | **Yes** — same pattern as Documentation                                   | Already wired      | n/a                      |

---

### Wiring Matrix Summary

- **Total menu item rows:** 22
- **Already correctly wired:** 10 — Cut/Copy/Paste, Find in Chat, Exit Chat Mode ×2, Theme submenu, About, Documentation, Report Issue
- **Wrong-event dispatch (one-line fix in `TitleBar.workbench.menus.ts`):** 2 — Tools > Settings (line 163), Tools > Keyboard Shortcuts (line 168)
- **No listener, existing handler available:** 9 — New Session, New Chat, Open Project, Switch Project (per-item), Toggle Outer Rail, Toggle Inner Sidebar, Toggle Utility Drawer, Toggle Terminal Dock, Toggle Artifact Pane
- **No handler — recommend menu item removal:** 2 — Find Next, Find Previous

**Phase D implementer note on `handlers` scope:** `handlers` (type `WorkbenchHandlers`) is constructed inside `ChatWorkbenchBody.tsx` and not threaded up to `ChatWorkbenchShell`. Simplest Phase D approach: add a `useWorkbenchMenuEvents` hook inside `ChatWorkbenchShell` that takes `layout`, `dock`, and a minimal handler set, registers `addEventListener` subscriptions in `useEffect` with cleanup. For `New Session`, the zero-prop-threading path is to dispatch `OPEN_MULTI_SESSION_EVENT` (already wired in `ChatWorkbenchShell.tsx:48`) rather than wire `handleCreateSession`.

---

## Section 2 — Bug Dependency Graph

### Root cause clusters

```
Root A — "dispatch-without-listener" — WIRING BUG (Phase D)
│
├─ Bug #13: "File > New Session froze IDE"
│     Primary cause: WORKBENCH_NEW_SESSION_EVENT dispatched, no listener
│     → no session created, no side-effect runs.
│     Secondary cause (the "freeze"): dropdown portal fails to dismiss after
│     click. Phase E E4 diagnoses this secondary symptom.
│
├─ Bug #14: "View / Tools items silently no-op"
│     Same pattern — all View toggle events and Tools > Settings dispatch
│     events with zero consumers in workbench shell tree.
│
└─ Sub-bug: "Edit > Find Next / Find Previous no-op"
      WORKBENCH_FIND_NEXT/PREV_EVENT dispatched; no listener;
      ChatSearchOverlay has no find-next/prev implementation.

FIX ORDER: Phase D — all 9 missing subscriptions land together.
Wrong-event dispatches (Tools > Settings, Keyboard Shortcuts) land in
same commit. Find Next/Prev: remove menu items.

Root B — "sidebar bypasses workspace state owner" — STATE BUG (Phase C)
│
├─ Bug #2: "Chat-delete causes ~0.2s row flash on inner rail"
│     Cause: ChatHistorySidebar.handleDelete (lines 258–264) calls
│     applyDeleteToStore (lines 233–239) directly. Bypasses useThreadState.
│     Next render, useSyncStateIntoStore (storeSync.ts:48–82) writes
│     stale model.threads back → re-introduces deleted thread → flash.
│
└─ Bug #7: "WorkbenchRail delete path same desync"
      useWorkbenchRailActions.onDeleteThread (lines 71–84) calls
      applyLocalDelete (lines 21–27) — same pattern.

FIX ORDER: Phase C, C1. Both call sites routed to model.deleteThread →
useDeleteThreadAction (agentChatWorkspaceActions.ts:116–135). ONE logical
fix applied to TWO files.

Root C — "project write misses persistence layer" — STATE BUG (Phase C)
│
├─ Bug #3: "Projects added via outer rail vanish after restart"
│     OuterProjectRail.useAddProject (lines 240–249) calls addProjectRoot
│     (in-memory only) but never writes config.recentProjects.
│
└─ Bug #5: "Active project desync — inner rail shows project not in outer rail"
      layout.activeProject persists but is never validated against merged list.

FIX ORDER: Phase C, C2 + C3. Independent of C1; same phase commit.

Root D — "edit-mode re-mount cascade" — DIAGNOSTIC REQUIRED (Phase E → F)
└─ Bug cluster #9: Edit button disappears after entering edit mode, toolbar
      nuked on exit, Edit-mode scroll regression, minimap + scrollbar overlap.
      Hypothesis: phantom filePath identity change triggers key= change on
      FileViewer → full unmount+remount → useFileViewerState resets to initial.

FIX ORDER: Phase E E1 → Phase F F1 → integrates into Phase G.

Root E — "rule-load burst re-renders" — DIAGNOSTIC REQUIRED (Phase E → F)
│
├─ Bug #15: "Composer typing lags during agent rule-load burst (≥10 rules)"
│     Hypothesis: each InstructionsLoaded event fires separate useReducer
│     dispatch in useAgentEvents → AgentEventsContext re-renders ≥10 times
│     → store re-syncs ≥10 times → Lexical composer re-renders mid-keystroke.
│
└─ Bug #6: "Project rules don't appear in context-preview popover"
      Hypothesis: instructions_loaded.mjs hook emits events with workspaceRoot
      that doesn't match renderer's projectRoot filter, OR reducer drops them.
      LIKELY DIFFERENT ROOT CAUSE from Bug #15.

FIX ORDER: Phase E E2 + E3 → Phase F F2 + F3. Bugs #6 and #15 INDEPENDENT
in Phase F unless E reveals shared point of failure.
```

### Fix order / parallelism map

```
After Phase A completes, all of the following can run in parallel:

  Phase B (mechanical micro-fixes — Haiku, parallel)
  Phase C (state persistence — Sonnet)   ← Bugs #2, #3, #5, #7
  Phase D (wiring sweep — Sonnet)        ← Bugs #13, #14, Edit no-op
  Phase E (diagnostic sprint)            ← Bugs #6, #9 cluster, #13 secondary, #15
  Phase I (docs digest — Haiku)          ← independent

  Phase F (blocked on Phase E):
    F1 ← E1  (edit-mode)
    F2 ← E2  (project rules)
    F3 ← E3  (composer lag)
    F4 ← E4  (New Session freeze portal)

  Phase G (artifact pane) — Phase 0 decision 9 locked;
    integrates F1 edit-mode fix → soft dependency on F.

  Phase H (context popover) — Phase 0 decisions 11+12 locked.

  Phase J (wrap + smoke) — gated on all phases complete.
```

**Most consequential single dependency:** All 9 missing-listener bugs (#13 primary, #14, Edit Find-Next/Prev) collapse to the same dispatch-without-listener root cause and resolve in a single Phase D subscription sweep across `ChatWorkbenchShell`. **11 user-observable menu items start working from one targeted `useEffect` block.**

---

## Section 3 — Chat-Delete Cascade Sequence Diagram

### Current (broken) path

```
Cole          ChatHistorySidebar       AgentChatStore (Zustand)    AgentChatWorkspace
 │                  │                         │                          │
 │── right-click ──►│                         │                          │
 │   Delete         │                         │                          │
 │                  │── deleteThread(id) ────►│ (IPC: delete from DB)    │
 │                  │◄─ IPC resolves ─────────┤                          │
 │                  │                         │                          │
 │                  │── applyDeleteToStore ──►│                          │
 │                  │   [sidebar.tsx:261]     │ store.setState:          │
 │                  │                         │   threads = filter(id)   │
 │                  │                         │   activeThread = null    │
 │                  │                         │                          │
 │                  │                         │──── React re-render ────►│
 │                  │                         │              [model.threads still
 │                  │                         │               contains deleted
 │                  │                         │               thread — useThreadState
 │                  │                         │               not notified]
 │◄── sidebar renders, row GONE ──────────────┤                          │
 │   (correct first paint)                    │   useSyncStateIntoStore ─┤
 │                  │                         │   [storeSync.ts:54-70]   │
 │                  │                         │   store.setState({       │
 │                  │                         │     threads: model.threads ← STALE
 │                  │                         │   })  ← deleted thread   │
 │                  │                         │        re-injected!      │
 │                  │                         │──── React re-render ────►│
 │◄── sidebar renders, row RE-APPEARS ────────┤                          │
 │   (FLASH ~0.2s)                            │                          │
 │                  │                         │   [next reconcile cycle  │
 │                  │                         │    settles correctly]    │
 │◄── sidebar renders, row GONE again ────────┤                          │
 │   (final correct state)                    │                          │
```

**Broken invariant:** `applyDeleteToStore` (`ChatHistorySidebar.tsx:233–239`) bypasses `useThreadState` — the workspace's `useState` that owns `model.threads`. `useSyncStateIntoStore` (`AgentChatWorkspace.storeSync.ts:54–70`) subsequently writes stale `model.threads` back to the store, re-injecting the deleted row.

### Post-fix path

```
Cole       ChatHistorySidebar    agentChatStore context    useDeleteThreadAction    useThreadState
 │              │                      │                         │                       │
 │── right-────►│                      │                         │                       │
 │   click      │                      │                         │                       │
 │              │── reads deleteThread ►│                         │                       │
 │              │   from store context  │                         │                       │
 │              │                      │                         │                       │
 │              │── model.deleteThread(id) ────────────────────►│                       │
 │              │   [agentChatWorkspaceActions.ts:116-135]        │                       │
 │              │                      │                         │── IPC ────────────────►│
 │              │                      │                         │◄─ IPC resolves ────────│
 │              │                      │                         │                       │
 │              │                      │                         │── setThreads ─────────►│
 │              │                      │                         │   (filter: id out)     │
 │              │                      │                         │── setActiveThreadId ──►│
 │              │                      │                         │   (null if matched)    │
 │              │                      │                         │                       │
 │              │                      │   useThreadState.threads updated (CORRECT)      │
 │              │                      │                         │                       │
 │              │                      │   useSyncStateIntoStore ─────────────────────► │
 │              │                      │   [storeSync.ts:54-70]                         │
 │              │                      │   store.setState({                              │
 │              │                      │     threads: model.threads ← CORRECT (filtered)│
 │              │                      │   })                                            │
 │              │                      │──── React re-render ──────────────────────────►│
 │◄── sidebar renders, row GONE ONCE ────                                                │
 │   (single update, no flash)                                                           │
 │                                                                                      │
 ▼                                                                                      │
[TERMINUS — Site 1 per wave-process.md]                                                │
Cole, in a live IDE chat-only window, right-clicks a chat row and selects Delete.      │
The row vanishes from the inner rail in a single visual update with no flicker         │
and no momentary re-appearance. Closing and reopening the chat-only window             │
confirms the thread is gone permanently.                                               │
```

**Key structural difference:** Exactly ONE write point for `threads`: `useDeleteThreadAction → setThreads` (inside `AgentChatWorkspace`'s React state). When `useSyncStateIntoStore` subsequently runs, `model.threads` is already post-delete — store update is idempotent. No intermediate re-injection. **Render count between delete and stable state is 1, not 3.**

**Files to change in Phase C (C1):**

| File                                                                      | Lines to change | Change                                                                                                                 |
| ------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/components/Layout/ChatOnlyShell/ChatHistorySidebar.tsx`     | 233–239         | Delete `applyDeleteToStore` function body                                                                              |
| `src/renderer/components/Layout/ChatOnlyShell/ChatHistorySidebar.tsx`     | 258–264         | Replace `applyDeleteToStore(store, id)` with `store.getState().deleteThread?.(id)` (or via `useAgentChatStoreContext`) |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchRailActions.ts` | 21–27           | Delete `applyLocalDelete` function body                                                                                |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchRailActions.ts` | 71–84           | Replace `applyLocalDelete` call with route through `store.getState().deleteThread?.(threadId)`                         |

The canonical implementation at `agentChatWorkspaceActions.ts:116–135` (`useDeleteThreadAction`) updates `useThreadState.setThreads` and `useThreadState.setActiveThreadId` — the same React state that `model.threads`/`model.activeThread` derive from, which `useSyncStateIntoStore` then syncs to the Zustand store in a single subsequent effect.

---

_Phase A complete. 22 rows in wiring matrix; 9 missing-listener bugs collapse to one Phase D sweep._
