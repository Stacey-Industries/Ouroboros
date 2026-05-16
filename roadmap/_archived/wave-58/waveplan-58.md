# Wave 58 — Chat Workbench UX Closeout
**Status:** ✅ COMPLETED — 2026-04-27 · Released as v2.7.1 · Result: `roadmap/auto-briefs/wave-58-result.md`

## Implementation Plan

**Version target:** v2.7.x (patch — fixing shipped defects from Wave 47; no new feature surface)
**Feature flags:** None new. Existing `layout.chatWorkbench` continues to gate the workbench shell. Default flip is **explicitly out of scope** until Wave 58 closes.
**Dependencies:**
- Wave 46 / 47 chat-workbench shell on master (`ChatWorkbenchShell`, `WorkbenchRail`, `ChatWorkbenchBody`, `ChatWorkbenchUtilityDrawer`, `useWorkbenchSurfacePolicy`, `useArtifactHistoryStack`, etc.)
- Audit document: `roadmap/wave-47-audit.md` — every defect fixed here is cited in that audit.
- Existing classic shell as design reference: `ChatHistorySidebar`, `ChatOnlyUserMenu`, `RightSidebarTabs` (rules tab).

**References:**
- `roadmap/wave-46-plan.md` — original workbench introduction
- `roadmap/wave-47-plan.md` — follow-through (under-delivered)
- `roadmap/wave-47-audit.md` — defect inventory
- `src/renderer/components/Layout/ChatOnlyShell/*` — workbench shell surface
- `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` — composition tree
- `src/renderer/styles/tokens.css` + `src/renderer/styles/globals.css` `@theme` block — design tokens
- `.claude/rules/renderer.md` — token/styling discipline
- `src/renderer/components/AgentChat/ChatHistorySidebar.tsx` — rail-management context-menu reference
- `src/renderer/components/Layout/RightSidebarTabs.tsx` — rules-tab reference

---

## Background

Wave 47 closed with all phase commits landed, all unit tests passing, lint clean, typecheck clean, and full vitest suite (8658 tests) green. The wave was tagged as `v2.7.0`.

On first hands-on use of the chat-workbench shell, multiple BLOCKER-level UX defects were immediately visible:

- All borders render as opaque white because the entire workbench tree uses `border-stroke-default`, a Tailwind class that does not map to any token in the design system.
- A literal debug label "Active utility: {tab name}" is rendered as permanent visible UI.
- The "Launch agent" button dispatches an event with no listener, doing nothing.
- There is no user menu, settings access, theme toggle, exit, or logout reachable from the workbench shell — `ChatOnlyUserMenu` was never ported from the classic chat-only shell.
- The rail has no delete/rename/pin/archive affordances. New sessions are created but the chat doesn't navigate to them.
- The "Active utility:" toggle row is a developer scaffold (Rail / Artifact / Utility / Terminal pill buttons) that was never replaced with production chrome.
- `approvalCount` is hardcoded to `0`, permanently disabling approval-triggered drawer auto-open.
- Phase F integration tests for Wave 47 mock the components they purport to test (`useWorkbenchArtifacts`, `ChatWorkbenchComparePane`), so the green test suite proves nothing about real joins.

These defects shipped despite green CI because the test gate measured implementation-shape, not user experience. Pre-push verification needs a manual smoke pass for any UI-bearing wave going forward.

Wave 58 closes these defects. No new features. Tight scope.

---

## Goals

1. The workbench shell is **visually correct on first launch** — no white borders, no debug labels, no developer scaffolding visible.
2. Every interactive control in the shell **does what its label claims** — Launch agent launches, New session navigates, rail items can be managed.
3. **Feature parity with the classic chat-only shell** for non-workstation surfaces — user menu, settings access, theme, shortcuts, exit, density, rules.
4. **Real integration coverage** — tests exercise actual joins, not mocked stubs.
5. A **manual smoke gate** is documented and required before any future UI-bearing wave is signed off.

---

## Non-goals

- Default-flipping `layout.chatWorkbench` to `true`. That waits for the soak checklist after Wave 58 closes.
- Redesigning the workbench layout itself (rail position, drawer location, terminal dock chrome). Out of scope — fix what's there before changing the shape.
- Decoupling `chatWorkbench` from `immersiveChat` so the workbench can mount alongside the IDE shell. Tracked separately if requested.
- New features (rules editing, session-export, multi-window compare). The rules panel restored in Phase E is a **read-only display port** of the existing classic surface, not a new feature.

---

## Phase A — Visual + scaffold cleanup

**Scope:** Eliminate every BLOCKER that's visible on first paint.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRail.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRailSections.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchSessionRow.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchBody.parts.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchBody.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchUtilityDrawer.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchTimelinePanel.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchTerminalDock.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchComparePane.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ArtifactHistoryList.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchApprovalPanel.tsx`

**Actions:**
1. Replace every `border-stroke-default` occurrence with the correct semantic token. Default mapping: solid panel boundaries → `border-border-semantic`; subtle internal dividers → `border-border-semantic-subtle`. Use `grep -rn 'stroke-default' src/renderer/components/Layout/ChatOnlyShell/` to enumerate; verify zero remain.
2. Delete the "Active utility: {layout.activeUtilityTab}" label at `ChatWorkbenchBody.parts.tsx:75-80` entirely.
3. Replace `WorkbenchToggleRow` (the Rail / Artifact / Utility / Terminal pill bar at `ChatWorkbenchBody.parts.tsx:47-81`) with production chrome:
   - Rail toggle becomes an icon button in the title bar (next to the existing sidebar-pin toggle).
   - Artifact / Utility / Terminal toggles become hover-revealed close buttons on each respective panel's own header — no global toggle row needed.
   - The drawer header gains a visible close button (currently buried).
4. Audit any remaining `WorkbenchRail` / `WorkbenchSessionRow` / `WorkbenchRailSections` styles for hardcoded hex / rgba / pixel-color values per `.claude/rules/renderer.md`. Replace with tokens.

**Acceptance criteria:**
- `grep -rn 'stroke-default' src/renderer/` returns zero matches.
- `grep -rn 'Active utility' src/renderer/` returns zero matches in non-test files.
- `WorkbenchToggleRow` no longer exists; the `data-testid="chat-workbench-utility-tab"` element is gone.
- Each panel (rail, artifact, utility drawer, terminal dock) has its own close affordance in its own header.
- Manual smoke: launch the app with `chatWorkbench: true`, open every surface, confirm no white borders, no debug labels, no orphan toggle row.

**Tests:**
- New: `WorkbenchRail.borders.test.tsx` — assert computed `borderColor` resolves to a non-white CSS variable on a sample row (jsdom limitation: assert via class names if computed style is unreliable).
- Update: any test that asserted `data-testid="chat-workbench-utility-tab"` exists. Remove the test, do not soften the assertion.
- Update: `ChatWorkbenchUtilityDrawer.test.tsx` — close button is now in the drawer header, not the toggle row.

**Exit gate:** Manual smoke checklist signed (see Phase F for the checklist template).

---

## Phase B — User menu, settings, theme, exit, density

**Scope:** Restore the affordances `ChatOnlyUserMenu` provides in the classic shell, in a workbench-appropriate location.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRail.tsx` (or a new `WorkbenchRailFooter.tsx`)
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` (if mount placement changes)

**Actions:**
1. Mount `ChatOnlyUserMenu` (existing component, no rewrite) in the workbench rail footer, mirroring the classic shell's `ChatHistorySidebar` placement at line 145. The menu already includes:
   - Settings (Ctrl+,) — opens `ChatOnlySettingsOverlay`
   - Theme toggle
   - Keyboard shortcuts (Ctrl+/) — opens `KeyboardShortcutCheatSheet`
   - Command palette (Ctrl+K)
   - Exit chat mode
   - Log out
   - Density toggle (verify; if not present in `ChatOnlyUserMenu`, add it as a menu item that flips `config.layout.uiDensity` between `comfortable` and `compact`).
2. Verify keyboard shortcut handlers (Ctrl+, Ctrl+/ Ctrl+K, Ctrl+Shift+I) still fire in workbench mode — `ShellOverlays` is mounted, so they should, but confirm with a manual test.
3. If the rail is collapsed (icon-only mode in classic shell), ensure the user-menu trigger remains accessible — add an icon-only fallback in the title bar.

**Acceptance criteria:**
- `ChatOnlyUserMenu` is mounted in `ChatWorkbenchShell` (verify via `grep -n 'ChatOnlyUserMenu' src/renderer/components/Layout/ChatOnlyShell/`).
- All six menu items are reachable in workbench mode.
- Density toggle persists to `config.layout.uiDensity`.
- Manual smoke: open user menu, click each item, confirm correct overlay/action fires.

**Tests:**
- New: `ChatWorkbenchShell.userMenu.test.tsx` — render the workbench shell, find the user-menu trigger, click each item, assert the corresponding overlay opens or event fires. **Do not mock `ChatOnlyUserMenu`** — render the real component.

**Exit gate:** Manual smoke checklist updated; user-menu items verified live.

---

## Phase C — Wire the no-op buttons

**Scope:** Make every interactive control do what its label promises.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchBody.model.ts`
- `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchSessionActivation.ts`
- Possibly: a new `useWorkbenchAgentLauncher.ts` hook if needed

**Actions:**
1. **Launch agent** — replace `handleLaunchAgent`'s DOM event dispatch with a real launcher call. Two options:
   - **Option A (preferred):** import the actual launcher API from `src/renderer/components/AgentChat/AgentLauncher` (or wherever the IDE shell's multi-session launcher lives) and call it directly.
   - **Option B (fallback):** register a `window.addEventListener(OPEN_MULTI_SESSION_EVENT, ...)` in `ChatWorkbenchShell.tsx` that opens the launcher modal, mirroring what the IDE shell does.

   Pick A unless A causes a circular import or pulls in IDE-shell chrome that shouldn't mount in workbench mode.

2. **New session navigation** — fix `handleCreateSession` so that after `createStoredSessionFromPicker` returns a session:
   - Create or auto-select a default thread for that session (not `null`).
   - Pass the resolved `threadId` to `selectThread`.
   - If thread creation requires an explicit user step, surface that affordance instead of silently failing.

3. **Compare button on rail rows** — verify `onCompare` actually opens the compare pane. The audit didn't fully verify this; treat it as suspect until confirmed by manual test.

**Acceptance criteria:**
- Clicking "Launch agent" opens the agent launcher modal (or equivalent UI).
- Clicking "New session" creates a session **and** the conversation pane navigates to that session's default thread.
- Clicking the compare button on a rail row opens `ChatWorkbenchComparePane` with that session as the secondary.

**Tests:**
- New: `ChatWorkbenchBody.launcher.integration.test.tsx` — render the body, click "Launch agent", assert the launcher modal mounts. **No mocks of the launcher itself.**
- Update: `ChatWorkbenchBody.model.test.ts` — assert `handleCreateSession` resolves a non-null `threadId` before calling `selectThread`.

**Exit gate:** Manual smoke — click each button, confirm the action.

---

## Phase D — Rail management actions

**Scope:** Port the context menu from `ChatHistorySidebar` so users can manage sessions and chats from the workbench rail.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchSessionRow.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRecentChatRow.tsx` (or equivalent)
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRail.tsx`
- New: `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRailContextMenu.tsx`

**Actions:**
1. Identify the actions exposed in `ChatHistorySidebar`'s context menu (delete, rename, pin/unpin, archive, possibly export). Read `ChatHistorySidebar.tsx` and its action handlers; reuse those handlers.
2. Add a context menu (right-click + a `…` button) to `WorkbenchSessionRow` and the recent-chat row component.
3. Wire each action to the existing handler. Do not re-implement the underlying CRUD — the IPC and store actions already exist.
4. Confirm pin/archive state persists to the same place as the classic shell (likely `config.layout.pinnedThreadIds` or `agentChatStore`).

**Acceptance criteria:**
- Right-click a session row → menu appears with delete/rename/pin/archive (and any other actions the classic shell has).
- Each action fires the same handler the classic shell uses.
- State changes (pin, archive) reflect in both shells without a reload.

**Tests:**
- New: `WorkbenchRailContextMenu.test.tsx` — render a row, fire `contextmenu` event, assert menu items appear, click each, assert the correct handler is invoked.
- Update: `WorkbenchRail.test.tsx` — sanity test that the menu integration doesn't break existing row behavior.

**Exit gate:** Manual smoke — delete a session from the rail, confirm it's gone in both workbench and classic shell.

---

## Phase E — approvalCount + rules panel restoration

**Scope:** Fix the hardcoded `approvalCount: 0` and add the rules panel back to the utility drawer.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchBody.model.ts`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchUtilityDrawer.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchSurfacePolicy.ts` (verify consumption)

**Actions:**
1. **`approvalCount` fix:**
   - Replace `approvalCount: 0` at `ChatWorkbenchBody.model.ts:63` with the real count read from `useApprovalContext()`.
   - Verify `useWorkbenchSurfacePolicy` correctly auto-opens the drawer + `approvals` tab when count transitions from 0 → ≥1.
   - Confirm dismissal-keying still works (closing the drawer for an event key doesn't re-open on the same key).

2. **Rules panel:**
   - Add a `rules` tab to `DRAWER_TABS` in `ChatWorkbenchUtilityDrawer.tsx`.
   - Mount the existing rules panel (find it via `grep -rn 'RulesPanel\|RulesView' src/renderer/`) — likely lives under `RightSidebarTabs` or `components/Rules/`.
   - The panel is a port; do not reimplement. If the existing panel has tight coupling to `RightSidebarTabs` props, extract a presentational core component and reuse it.

**Acceptance criteria:**
- Triggering an approval (manual smoke: have an agent request a tool call requiring approval) auto-opens the drawer to the approvals tab.
- A `rules` tab is visible in the drawer with the same content as the classic shell's rules view.

**Tests:**
- New: `useWorkbenchSurfacePolicy.approvals.test.ts` — when `approvalCount` transitions 0 → 1, drawer opens to `approvals`. When user dismisses and `approvalCount` stays at 1, no re-open.
- New: `ChatWorkbenchUtilityDrawer.rules.test.tsx` — render with `activeTab='rules'`, assert the rules panel is mounted with real props (no mock).

**Exit gate:** Manual smoke for both subitems.

---

## Phase F — Real integration coverage + manual smoke gate

**Scope:** Replace the mocked-stub integration tests with real ones, and document the manual gate that should have caught Wave 47's defects.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchFollowThrough.integration.test.tsx`
- New: `src/renderer/components/Layout/ChatOnlyShell/wave46CoverageCatchup.test.tsx`
- `roadmap/session-handoff.md` — add manual smoke checklist
- `.claude/rules/manual-smoke-gate.md` — new rule (or extend existing `test-scope.md`)
- `CLAUDE.md` (root) — pointer to the manual smoke gate

**Actions:**
1. **Rewrite `ChatWorkbenchFollowThrough.integration.test.tsx`:**
   - Remove all mocks of `useWorkbenchArtifacts` and `ChatWorkbenchComparePane`.
   - Test real joins: open an artifact via the surface policy, switch tabs in the drawer, open the compare pane, click rail rows, confirm utility drawer auto-opens on approval. Provide test fixtures via `AgentEventsContext` and `ApprovalContext` rather than mocking the consumers.
   - If `FileViewerManager` provider is needed, mount it.

2. **Create `wave46CoverageCatchup.test.tsx`:**
   - The Wave 47 plan specified this. Cover the Wave 46 join paths the original integration test missed: artifact pane content routing for each viewer mode, layout persistence across mounts, utility drawer auto-open + dismissal-key flow.

3. **Manual smoke checklist:**
   - Add a checklist template to `roadmap/session-handoff.md` titled "Manual smoke gate" with concrete actions: launch app with flag on, screenshot every surface, click every interactive control, verify no debug labels visible, verify no white-on-dark border issues, exit and re-enter chat mode, etc.
   - Document this gate in a new rule file `.claude/rules/manual-smoke-gate.md` triggered by changes under `src/renderer/components/Layout/**`. The rule mandates that any wave touching renderer layout code must have a signed manual smoke entry in the wave's result brief.

4. **Update `CLAUDE.md` (root):**
   - Add a one-line pointer in the "After you code" section: "UI-bearing changes require a signed manual smoke entry — see `.claude/rules/manual-smoke-gate.md`."

**Acceptance criteria:**
- `ChatWorkbenchFollowThrough.integration.test.tsx` has zero `vi.mock` calls for components defined within the workbench shell.
- `wave46CoverageCatchup.test.tsx` exists and covers the three named flows.
- `roadmap/session-handoff.md` has a manual smoke checklist.
- `.claude/rules/manual-smoke-gate.md` exists and is referenced from root `CLAUDE.md`.

**Tests:**
- The phase's own deliverables ARE the tests. Run them; they must pass without mocks of the components under test.

**Exit gate:**
- Full manual smoke completed against the workbench shell.
- `roadmap/auto-briefs/wave-58-result.md` written with phase summaries, tests added, files touched, and the signed manual smoke checklist embedded.
- Parent runs full vitest, lint, typecheck before push (existing gate).

---

## Phase dispatch order

| Phase | Order | Reason |
|---|---|---|
| A | First | Visual fixes are independent and unblock the manual smoke gate for later phases |
| B | After A | User menu / settings — unblocks density and exit affordances during smoke testing |
| C | After A | Button wiring — independent of B but benefits from clean visuals during testing |
| D | After C | Context menu reuses session-management handlers; lower risk if launcher already works |
| E | After C | Approvals + rules — independent of D but benefits from the user menu in B for navigation |
| F | Last | Tests + docs — must come after all behavior is correct, otherwise tests would lock in defects |

Phases A, B, C can be parallelized if dispatched as separate subagents under tight scope. D and E depend on C and B respectively. F gates on all prior phases.

---

## Risk notes

- **Token-replacement scope creep.** When fixing `border-stroke-default`, the implementer may notice other token misuse. Resist the urge to fix unrelated styling. File a separate ticket; do not bundle.
- **Rules-panel coupling.** The existing rules panel may be tightly bound to `RightSidebarTabs` props. If extraction balloons beyond a presentational split, consider deferring the rules tab to a follow-up wave and shipping Phase E with only the `approvalCount` fix. Document the deferral.
- **Launcher import direction.** Importing the IDE-shell launcher into the chat-workbench shell may create a layering inversion. If `ChatOnlyShell` was designed to not depend on IDE-shell components, extract the launcher's core into a shared module first.
- **Manual smoke gate enforcement.** A rule file alone won't enforce the gate — agents will skip it. The actual enforcement is the parent (orchestrator) refusing to push without the signed entry. Document this clearly so future orchestrators don't repeat my Wave 47 mistake.

---

## Out-of-band hot-fix consideration

If the user wants the workbench usable **before** Wave 58 lands in full, the BLOCKER set from Phase A (token cleanup + debug label + dev scaffold) can ship as a single hot-fix commit ahead of the wave. Phase B's user menu can also ship hot — it's a single component mount. Defer C/D/E/F to the wave proper.

Decision left to the user.

---

## Definition of done

Wave 58 is complete when:

1. All 13 audit findings (4 BLOCKER, 6 MAJOR, 3 MINOR/NIT) have a fix-or-defer disposition. Defers must have a written reason and a follow-up wave or issue.
2. The workbench shell is usable as a daily driver — no debug labels, no white borders, every interactive control works.
3. Integration tests exercise real joins.
4. The manual smoke gate is documented and the wave's own smoke entry is signed in the result brief.
5. `roadmap/auto-briefs/wave-58-result.md` exists.
6. Optional: `layout.chatWorkbench` default flip can be reconsidered (separate decision; not part of Wave 58 itself).
