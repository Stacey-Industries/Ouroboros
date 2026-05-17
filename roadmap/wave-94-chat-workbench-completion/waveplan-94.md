---
status: DRAFT
created: 2026-05-17
updated: 2026-05-17
wave: 94
slug: chat-workbench-completion
tag: v2.19.0
---

# Wave 94 — Chat-Workbench Completion (Post-Wave-89 Pivot Gaps)

## Status

DRAFT · target `v2.19.0` (minor — feature wave) · drafted 2026-05-17 during Wave 89 deferred smoke walk.

## Context

Wave 89 (ChatOnly Layout Overhaul, SHIPPED 2026-05-16 as v2.18.0) pivoted mid-wave to a terminal-first shell — `AgentChatWorkspace` removed, two-slot terminal dock fills full main area, model/permission chips relocated to title bar. The deferred manual smoke gate (per `roadmap/follow-ups/2026-05-16-wave-89-deferred-smoke-gate.md`) was walked 2026-05-17 after the Lane B hang-fix wave unblocked it. The walk surfaced **five contract gaps** that ship-time tests didn't catch — none are crashes, all are reachable-but-broken UX surfaces that the pivot left half-wired.

A bundled Wave 89.0.1 hotfix (commit upstream of this plan) addressed four mechanical issues from the same smoke walk: phantom box below the dock, transparent unreadable overlays, dead `+ New chat` button + redundant chats column, inert title-bar model/permission chips. The remaining five are wave-shaped — they need design decisions, cross-file changes, or new producer wiring rather than mechanical fixes.

This is a sanctioned feature wave per the pipeline (Wave 89 left contracts unfulfilled; closing them completes the pivot). Not a fix-sweep — three of the five items are net-new functionality, not bug fixes.

## Goal

After Wave 94, the chat-workbench terminal-first shell is **complete**:

- The title bar exposes utility + artifact as independent toggle buttons; neither surface is reachable only via implicit auto-open events. Users can always open the utility drawer to see Activity / Approvals / Monitor / Rules.
- Terminal sessions are owned per-project: switching the active project on the outer rail swaps both dock slots' session sets atomically. Sessions persist per project across switches and restarts.
- Each dock slot (`primary`, `secondary`) has its own tab strip — `+ New` spawns a new tab in the slot, the previous tab stays selectable, no session is lost to "somewhere I can't get back to."
- The inner-rail Terminals tab lists all sessions for the active project, with click-to-promote into a chosen slot. Spawning from the rail no longer orphans the session.
- Diff-review producer fires on terminal Claude sessions' write-class tool calls — Review tab and artifact-pane `kind='diff'` populate from interactive `claude` activity in either dock slot, not only from the removed chat path.

## Open decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-94-chat-workbench-completion/wave-94-decisions.md` (to be filled during Phase 0).

1. **Title-bar surface split — Option A confirmed.** Two distinct toggle buttons (utility + artifact), each owning its own surface state. Diagnostic (2026-05-17 session) ruled out Options B/C — both leave utility partially hidden behind agent activity.

2. **Per-project terminal state shape — open.** Three candidates:
   - **2a.** `Map<projectPath, { primary: SessionTab[], secondary: SessionTab[], activePerSlot: {primary, secondary} }>` — single source of truth in a new `useProjectTerminals` hook, replacing the per-slot `useTerminalSessions` instances. Atomic project switch.
   - **2b.** Keep per-slot `useTerminalSessions` but add a project-key dimension to its persistence layer. Less invasive, but the dock slots still share global session pool — switching project would have to filter the visible set rather than swap atomically.
   - **2c.** Lift session state to `ProjectContext`, expose via selector hooks. Most general; biggest refactor; potentially overkill for two slots.
   - Recommendation pending ADR review. Default lean: **2a** (cleanest atomic switch, matches user mental model of "this project's terminals").

3. **Diff-review producer wiring — snapshot strategy open.** Three candidates surfaced by the feasibility diagnostic:
   - **3a. Always-on:** `pre_tool_use` hook for write-class tools captures `git.snapshot` synchronously. Simplest path, but adds git-commit latency to every Edit/Write/MultiEdit in any terminal Claude session regardless of whether the user ever opens diff review.
   - **3b. Opt-in setting:** `ClaudeCliSettings.enableTerminalDiffReview` (default `true` per repo convention). Pays latency only when enabled; disables for users who don't use diff review.
   - **3c. Background capture:** snapshot fires async, doesn't block the tool call. Race condition possible where pre-state isn't captured before the tool completes — would need a fallback ("no pre-state available" empty state in the review UI for that case).
   - Recommendation pending ADR review. Default lean: **3b** with default `true` — preserves the existing "new features default to true" convention while letting the user disable it if the latency bites in their workflow.

4. **Inner-rail Terminals tab semantics — single-click promote or right-click context menu?** With per-project session lists, clicking a rail terminal entry should activate it in a slot. Open: which slot? Recommendation: single-click promotes to whichever slot is currently focused; if neither is focused, promotes to `primary`. Right-click for explicit slot choice. Matches VS Code's terminal panel UX.

5. **Tab strip placement within slot header** — the existing `SlotHeader` is 28px (per Wave 89 Phase 4c). Adding tabs adds height. Options: (a) extend slot header to 48px with tab row; (b) tab row above slot header (50px total chrome); (c) tabs replace the slot label (`Primary` / `Shell`) when sessions exist. Recommendation: **(c)** — sessions ARE the slot's identity once spawned; the label is redundant. Empty-slot state still shows `Primary` / `Shell`.

## Scope

**In scope:**

- **Phase A — Title-bar surface split (Option A).** Replace `RightPaneToggleButton` with two distinct buttons (`UtilityPaneToggleButton` + `ArtifactPaneToggleButton`), each toggling its own surface independently. Update `useChatWorkbenchLayout` to expose `toggleUtility()` + `toggleArtifact()` directly (the existing `toggleRightPane` + `lastRightPaneView` cycling stays for backward-compat for any keyboard shortcut consumers, but the title bar uses the new direct toggles). Each button's icon reflects its surface's open state. Adjust `WorkbenchControls` strip layout.

- **Phase B — Per-project terminal isolation.** Per ADR Decision 2a (likely): new `useProjectTerminals(activeProject)` hook returns `{ primary, secondary }` session sets for the active project, replacing per-slot `useTerminalSessions`. State shape: `Map<projectPath, ProjectTerminalState>` persisted to electron-store key `terminalSessionsPerProject`. Project switch triggers atomic swap. Active sessions in each slot persist across switches. New persistence schema in `src/shared/config/` with migration from existing per-window roots.

- **Phase C — Terminal tabs in dock slots.** Each `DockSlot` renders a tab strip showing all sessions for that slot. `+ New` button appends a new session as a tab; previous sessions stay selectable. Tab close button removes the session. Per ADR Decision 5: tab strip replaces the slot label when sessions exist (`Primary` / `Shell` shows only in empty state). Active tab persists per slot per project.

- **Phase D — Inner-rail Terminals tab integration.** `InnerSidebarTerminals` lists all sessions for the active project (sourced from `useProjectTerminals`), grouped by slot. Per ADR Decision 4: single-click promotes to focused slot (or `primary` if none focused), right-click opens slot-choice context menu. Spawning from the rail (existing `+ New` in rail) appends to the focused or `primary` slot's tab strip. No more orphaned sessions.

- **Phase E — Diff-review producer wiring.** Per the feasibility diagnostic (`agent: a8791eac0e128dec8`, 2026-05-17):
  - `assets/hooks/post_tool_use.mjs` — forward `toolInput.file_path` for `Write`/`Edit`/`MultiEdit` in the pipe payload (currently stripped at line 54).
  - New main-process tap (`src/main/hooksDiffReview.ts`): on `pre_tool_use` for write-class tools, call `git.snapshot(sessionCwdMap.get(sessionId))`, stash `{correlationId → hash}`. On matching `post_tool_use`, retrieve hash, emit synthetic `diff_review_ready` event with `{snapshotHash, projectRoot, filePaths, sessionId}` via existing `sendPayload`.
  - Renderer hook (`src/renderer/hooks/useDiffReviewTrigger.ts`): listen for `diff_review_ready`, filter by sessionId-owned-by-this-window, call `openReview(sessionId, snapshotHash, projectRoot, filePaths)`.
  - Per ADR Decision 3 (likely 3b): gate behind `ClaudeCliSettings.enableTerminalDiffReview` setting (default `true`).
  - Boundary phase — orchestrator authors failing acceptance test BEFORE dispatch: end-to-end test spawning a `claude` session, simulating an Edit hook event, asserting `DiffReviewManager.openReview` is called with the right shape.

- **Phase F — Wave wrap.** Scoped suites (`test:main`, `test:renderer`, `test:agentchat`, `test:layout`), full lint + typecheck + formatter, `/review` mechanical gap-check, `wave-94-result.md`, `CHANGELOG.md [2.19.0]`, `git tag v2.19.0` post-CI, `HANDOFF.md` flip, manual smoke walk (the Wave 89 checklist re-run with the new surfaces), `/promote-vendor-lessons 94` (likely no-op — no new vendor SDK).

**Out of scope:**

- **Wave 90 — interactive `claude` substrate** (wiring primary dock slot to a long-running `claude` session). Pre-existing planned wave; depends on Phase E being SHIPPED but is its own scope.
- **Wave 91 — `-p` substrate cleanup.** Pre-existing planned wave.
- **AgentMonitor view as primary surface** — separate consideration; not part of this wave's pivot completion.
- **Rules-and-skills install flow** — `ecosystem.rulesAndSkillsInstallEnabled` defaults false per existing tech debt; wire-up is its own wave.
- **Tabs in IDE-view Terminal pane parity** — IDE shell's `TerminalPane` already has `TerminalTabs`; this wave adds tabs to chat-workbench dock slots specifically. Parity is conceptual, not literal code sharing — `useProjectTerminals` is workbench-only.

## Phases

| Phase | Topic | Implementer | Notes |
| ----- | ----- | ----------- | ----- |
| 0 | ADR | orchestrator | Resolve ADR Decisions 2 (state shape), 3 (snapshot strategy), 4 (rail promote semantics), 5 (tab strip placement). Author `wave-94-decisions.md`. |
| A | Title-bar surface split | sonnet-implementer | `ChatOnlyTitleBar.tsx`, `WorkbenchPanelToggleStrip.tsx` (new `UtilityPaneToggleButton`), `useChatWorkbenchLayout.ts` (expose direct toggles). Restore the existing `WorkbenchModelChips` import or leave as-is depending on whether chips wiring is also in scope (currently NOT — chips deferred until target-slot decision). |
| B | Per-project terminal isolation | sonnet-implementer | New `useProjectTerminals` hook, `terminalSessionsPerProject` electron-store key + migration, project-switch effect in `ChatWorkbenchShell`. Atomic swap. Boundary surface — config schema change + IPC if any. |
| C | Terminal tabs in dock slots | sonnet-implementer | `DockSlot.tsx` extended with tab strip; `SlotHeader` adjusts. New `DockSlotTabs` component. Tab persistence per slot per project. |
| D | Inner-rail Terminals integration | haiku-implementer (tight spec) | `InnerSidebarTerminals.tsx` consumes `useProjectTerminals`, renders per-slot session list, click-to-promote. Right-click menu via existing pattern. |
| E | Diff-review producer wiring | sonnet-implementer | **Boundary phase — vendor-adjacent (hooks pipe + git IPC).** Orchestrator authors failing acceptance test BEFORE dispatch. Five touch points per feasibility diagnostic: hooks script, new main tap, IPC event, renderer hook, settings gate. |
| F | Wave wrap | orchestrator | Scoped + full gates, `/review`, result brief, tag, manual smoke walk re-run. |

### Phase ordering

- Phase 0 gates A-E (ADR decisions).
- Phase A is independent of B/C/D/E (title bar isolation).
- Phase B is the foundation for C and D (both consume `useProjectTerminals`).
- Phase C and D can parallelize once B lands.
- Phase E is independent of A/B/C/D (separate subsystem — hooks pipe + diff review).
- Phase F blocks on all.

```
Phase 0 (ADR)
   |
   +---> Phase A (title bar split)             ----+
   |                                                |
   +---> Phase B (per-project terminals)            |
   |        |                                       |
   |        +---> Phase C (tabs in slots)    -------+
   |        +---> Phase D (rail integration) -------+
   |                                                |
   +---> Phase E (diff-review wiring)        ------+
                                                    |
                                                    v
                                            Phase F (wrap)
```

## Validation

- Per-phase scoped tests (`test:layout`, `test:agentchat`, `test:main`).
- Phase B + C + D: integration test covering project switch + tab spawn + rail promote in a single flow.
- Phase E: orchestrator-authored acceptance test (boundary contract) — fails before, passes after.
- Phase F: full manual smoke walk against the Wave 89 Phase 4c checklist (every item passes, plus the new tab + project-switch + rail-promote items).

## Risks

- **Phase B is the architectural risk.** If ADR Decision 2 picks the wrong shape, C and D have to be redone. Recommend Phase 0 includes a quick prototype-by-grep — confirm the chosen hook can be consumed by both DockSlot and InnerSidebarTerminals without circular state ownership.
- **Phase E latency.** ADR Decision 3 outcome materially affects user experience. If 3a (always-on) is picked without measuring `git.snapshot` cost on a representative repo, every terminal Edit gets slower. Recommend Phase 0 includes a measurement sub-task.
- **Wave 90 dependency on Phase E.** Wave 90 wires `primary` dock slot to interactive `claude`. If Phase E ships with a setting gate, Wave 90 must default the setting appropriately for the new substrate.
