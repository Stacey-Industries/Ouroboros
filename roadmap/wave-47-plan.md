# Wave 47 — Chat Workbench Follow-Through
## Implementation Plan

**Version target:** v2.6.0 (minor — complete the workstation follow-through that Wave 46 intentionally deferred)
**Feature flags:** keep `layout.chatWorkbench` as-is; add narrowly-scoped follow-up flags only where rollout risk justifies them
**Dependencies:** Wave 46 landed on `master`; reuse the existing chat-workbench shell, terminal dock, file viewer, diff review, approval, session store, and agent monitor systems
**References:**
- `roadmap/wave-46-plan.md`
- `src/renderer/components/Layout/ChatOnlyShell/*`
- `src/renderer/components/SessionSidebar/*`
- `src/renderer/components/FileViewer/*`
- `src/renderer/components/Terminal/*`
- `src/renderer/components/AgentMonitor/*`
- `src/renderer/contexts/ApprovalContext.tsx`

---

## Overview

Wave 46 successfully established the **chat-workbench shell**: a feature-flagged workstation layout, a docked terminal, a side artifact pane, and a utility drawer for approvals / review / activity.

The implementation review shows that the shell is real, but several parts are still **Phase-1 composition** rather than fully joined workstation behavior:

- the rail is still a **flat session list**, not the active/background/recent-chat IA described by Wave 46
- the shell mounts a **create-session no-op** instead of the real launcher integration
- artifact handling is still **current-file/current-diff only**, with no history stack and no adaptive file open policy
- utility-subagent behavior is still a **summary feed**, not transcript resolution or parent-turn-aware drill-in
- there is still **no generic HTML/web preview path**
- background session attention state and command/output inspection are still missing
- compare mode is still **architecturally hypothetical** unless workspace/session ownership is made explicit first

Wave 47 converts those thin joins into production-grade workstation behavior without changing the core chat-first layout decision from Wave 46.

Wave 47 also absorbs the **Wave 46 coverage catch-up** work. The first wave shipped acceptable shell scaffolding coverage, but not enough join-level coverage for the real workbench behaviors. That missed coverage is part of this wave’s implementation contract, not optional cleanup.

---

## Implementation review summary

### Confirmed strengths

- `ChatWorkbenchShell` is wired behind `layout.chatWorkbench` and preserves the classic shell when the flag is off.
- The terminal dock is real, reusable, and covered by scoped tests.
- The utility drawer already reuses approval and diff-review flows rather than rebuilding them.
- The current Wave 46 jsdom test slice passes and covers the top-level shell scaffolding.

### Confirmed gaps that should drive Wave 47 scope

- **Rail IA gap:** `WorkbenchRail` currently renders one flat list of `items` and the empty state still describes “scaffolding,” which confirms the session-first IA stopped short of the planned active/background/recent-chat split.
- **Launcher / selection gap:** `ChatWorkbenchShell` mounts `WorkbenchRail` with `onCreateSession={() => {}}`, so the workbench still lacks a real launch path from the new rail.
- **Activation gap:** workbench selection still relies on a DOM event path; the plan needs an explicit renderer bridge that owns `sessionCrud.activate`, active-session refresh, and workspace targeting.
- **Layout-state gap:** `useChatWorkbenchLayout` is local in-memory state only; the plan explicitly called for persisted dock/drawer/surface state and the current hook does not persist or expose width/height controls beyond the separate terminal hook.
- **Artifact gap:** `useWorkbenchArtifacts` only resolves `diff` or the current file-viewer tab, and `useAutoOpenArtifacts` only auto-opens for new diffs. There is no artifact history, no adaptive file opening, and no sidecar selection model for agent-touched artifacts.
- **Subagent gap:** the utility drawer routes the “subagents” tab to `WorkbenchActivityPanel mode="subagents"`, while `SubagentPanelHost` still hard-returns `null` from `resolveByToolCallId`, so transcript drill-in remains unimplemented.
- **Preview gap:** `ContentRouter` only routes preview mode for markdown; there is still no generic HTML preview host or sandbox path.
- **Compare gap:** current chat workspace ownership is still project-root oriented, so side-by-side sessions need explicit isolated-store and per-pane targeting rules before compare mode is safe.
- **Test gap:** the current integration test mocks away `WorkbenchRail` and `useWorkbenchArtifacts`, so the most important joins are not actually exercised end-to-end.

### Coverage catch-up targets from Wave 46

- `ChatWorkbenchShell` real-join integration coverage without mocking away `WorkbenchRail` / artifact selection.
- `useChatWorkbenchLayout` persistence and state-ownership coverage.
- `useWorkbenchArtifacts` selection precedence, history, and auto-open-key coverage.
- `ChatWorkbenchUtilityDrawer` real tab-content coverage for approvals / review / subagents / activity transitions.
- `SubagentPanelHost` positive-path transcript resolution coverage.
- `ContentRouter` HTML preview routing coverage once the preview host lands.

---

## Scope

### In-scope

- Finish the session-first rail IA: active sessions, background sessions, recent chats, and attention state.
- Replace the rail no-op with the real multi-session launcher / focus flow.
- Add an explicit session-activation bridge for workbench mode instead of relying on DOM-only selection side effects.
- Add background session notification and acknowledgement state.
- Add artifact history and adaptive auto-open rules for terminal / artifact / utility surfaces.
- Add explicit session-scoped artifact provenance instead of deriving history from project-global viewer state.
- Add a command/output timeline inspector for the active session.
- Finish subagent transcript resolution in workbench mode.
- Add side-by-side compare for two live sessions inside chat-workbench.
- Add generic HTML preview with explicit sandboxing and navigation guardrails.
- Expand tests and docs so the joins are verified rather than stubbed.
- Add explicit coverage catch-up for the Wave 46 surfaces that were only smoke-tested or were heavily mocked: rail grouping/selection, launcher integration, layout persistence, artifact selection/history, utility drawer tab behavior, subagent transcript resolution, and HTML preview routing.

### Out-of-scope

- Full arbitrary IDE pane splitting.
- New backend orchestration providers or transport stacks.
- Replacing the existing IDE shell.
- General-purpose browser tabs or remote web browsing inside the preview surface.
- Cross-window notification sync.

---

## Verified starting point

Wave 47 should treat these as already-landed and reusable:

- **Shell scaffold:** `ChatWorkbenchShell.tsx`
- **Terminal dock:** `ChatWorkbenchTerminalDock.tsx`, `useTerminalDockState.ts`
- **Artifact pane shell:** `ChatWorkbenchArtifactPane.tsx`
- **Utility drawer shell:** `ChatWorkbenchUtilityDrawer.tsx`, `WorkbenchApprovalPanel.tsx`, `WorkbenchActivityPanel.tsx`
- **Session adapter baseline:** `useWorkbenchSessions.ts`, `WorkbenchSessionRow.tsx`
- **Existing reusable systems:** `useSessions`, `useTerminalSessions`, `FileViewerManager`, `DiffReviewManager`, `ApprovalContext`, `AgentEventsContext`

Still incomplete and explicitly targeted by this wave:

- rail grouping + recent chats + real activation / launcher actions
- background-session attention model with explicit acknowledgement rules
- artifact history + adaptive surface policy + session-scoped provenance
- subagent transcript drill-in
- command/output timeline inspector
- compare view for two live sessions with isolated per-pane ownership
- safe HTML preview routing + strict viewer-state integration
- stronger integration coverage

---

## Architecture

```text
ChatWorkbenchShell
 ├─ WorkbenchRail
 │   ├─ NewWorkspaceSessionButton
 │   ├─ LaunchAgentButton
 │   ├─ ActiveSessionsSection
 │   ├─ BackgroundSessionsSection
 │   └─ RecentChatsSection
 ├─ WorkbenchSessionActivationBridge
 ├─ ConversationPane
 │   ├─ PrimarySessionWorkspace
 │   └─ CompareWorkspace (optional split, isolated store)
 ├─ ArtifactPane
 │   ├─ CurrentArtifactHost
 │   └─ ArtifactHistoryStack
 ├─ UtilityDrawer
 │   ├─ Approvals
 │   ├─ Review
 │   ├─ SubagentTranscriptPanel
 │   └─ ActivityTimelineInspector
 ├─ TerminalDock
 └─ SurfacePolicyController
     ├─ adaptive auto-open rules
     ├─ dismissal / snooze state
     ├─ per-session attention keys
     └─ primary-surface ownership
```

**Key design calls:**

- Wave 47 should not add random new panes. It should make the existing chat-workbench surfaces feel intentional by improving how they open, what they show, and how they relate to live session state.
- Singleton shell surfaces (`ArtifactPane`, `UtilityDrawer`, auto-open policy) stay bound to the **primary** session in compare mode unless the user explicitly promotes/swaps the secondary pane.
- “Background attention” must be **session-scoped** and keyed. No global reopen loops for unrelated sessions.

---

## Phase A — Rail IA, launcher join, and background attention

**Goal:** Make the left rail match the actual workbench mental model instead of a flat session list.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchAttention.ts` | ~140 | Tracks unseen completion, waiting approval, failed-session, and background-activity attention state for workbench sessions/chats. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchSessionActivation.ts` | ~120 | Owns `sessionCrud.activate`, focus refresh, and workbench session activation semantics. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchRecentChats.ts` | ~140 | Builds recent-chat rows from thread-oriented state instead of overloading the session adapter. |
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRailSections.tsx` | ~180 | Shared grouped rail rendering for active sessions, background sessions, and recent chats. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRail.tsx` | Replace flat list rendering with grouped sections and explicit recent-chat section. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchSessions.ts` | Keep ownership on live-session modeling only: classify active vs background, attach branch/worktree/provider metadata, and merge in attention state. |
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchSessionRow.tsx` | Add quick metadata chips for provider, branch/worktree, waiting approval, completion, and failure. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` | Wire real `onCreateSession` / `onLaunchAgent` / `onSelectSession` handlers and thread the activation bridge into the active workspace. |
| `src/renderer/components/MultiSession/useMultiSessionLauncherModel.ts` | Expose narrowly-scoped launcher hooks/actions needed by workbench mode. |
| `src/renderer/components/SessionSidebar/NewSessionButton.tsx` | Extract shared stored-session creation logic if workbench “New workspace session” reuses it. |
| `src/renderer/components/SessionSidebar/useSessions.ts` | Extract small helper(s) only if needed to avoid duplicating focus / activation logic. |

### Subagent briefing

- **Read first:** `WorkbenchRail.tsx`, `useWorkbenchSessions.ts`, `useSessions.ts`, `useMultiSessionLauncherModel.ts`, `ChatHistorySidebar.tsx`.
- The rail grouping is the actual product requirement. Do not keep a single flat `items.map(...)` structure and merely restyle it.
- Decide the top-rail affordances explicitly: `New workspace session` uses stored-session creation; `Launch agent` uses the launcher flow. Do not hide two different behaviors behind one ambiguous button.
- “Background” means live/resumable work that is not the currently focused session, not just archived items.
- Recent chats must remain secondary to live sessions and must come from a thread-oriented model, not from synthetic session counts.
- Attention state must be derived, not manually toggled from random UI components.
- Session selection must go through a real activation bridge that owns `sessionCrud.activate`; do not leave focus changes as DOM-event side effects.
- Define acknowledgement semantics in code and docs: what marks attention unseen, what clears it, and what remains sticky for failures/approvals.

### Acceptance

- [ ] Rail renders separate sections for active sessions, background sessions, and recent chats.
- [ ] `New workspace session` and `Launch agent` are explicit, distinct affordances with non-overlapping behavior.
- [ ] Selecting a rail item activates the correct session/thread through a real activation bridge, not a DOM-only event shim.
- [ ] Background sessions show attention state for completion, approval, and failure.
- [ ] Attention set/clear/snooze semantics are defined and session-scoped.
- [ ] Coverage is added for grouped rail rendering, launcher integration, and attention-state transitions.
- [ ] Coverage directly proves active/background/recent classification, section dedupe, attention ordering, keyboard selection, and metadata-chip rendering.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-47): Phase A — workbench rail IA and attention model`

---

## Phase B — Adaptive surface policy and artifact history

**Goal:** Make the workbench react intelligently to agent activity instead of only opening on diff-review state.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/useArtifactProvenance.ts` | ~160 | Maintains session-scoped artifact provenance from explicit agent/file/diff open events rather than from viewer-global state. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchSurfacePolicy.ts` | ~180 | Central policy for when to open terminal / artifact / utility surfaces and how user dismissals suppress re-open loops. |
| `src/renderer/components/Layout/ChatOnlyShell/useArtifactHistoryStack.ts` | ~140 | Tracks recently touched files/diffs/artifacts for the active workbench session. |
| `src/renderer/components/Layout/ChatOnlyShell/ArtifactHistoryList.tsx` | ~120 | Renders recent agent-touched artifacts with selection + pinning affordances. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchArtifacts.ts` | Move from “current file or current diff” to an explicit selection model that includes session-scoped provenance, recent agent-touched artifacts, and user-selected overrides. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx` | Add history stack, explicit artifact selection, and conservative auto-open affordances. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` | Replace ad hoc auto-open effects with the centralized surface policy hook. |
| `src/renderer/components/Layout/ChatOnlyShell/useChatWorkbenchLayout.ts` | Persist rail/artifact/utility state and dimensions in storage; remove dead `terminalOpen` state if terminal visibility remains owned by `useTerminalDockState`. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | Add minimal workbench-aware indicators/toggles only if they are part of the policy surface and do not clutter the bar. |

### Subagent briefing

- **Read first:** `ChatWorkbenchShell.tsx`, `useWorkbenchArtifacts.ts`, `ChatWorkbenchArtifactPane.tsx`, `AgentEventsContext`, `DiffReviewManager`, `FileViewerManager`.
- The adaptive policy must be explainable: no opaque “sometimes it opens” heuristics.
- Start conservative. Prefer opening on approvals, fresh diff review, explicit file open, or failed command traces.
- A dismissed surface must stay dismissed for the current attention key until a materially new event arrives.
- Artifact history is a session-scoped stack, not just `openFiles`.
- `FileViewerManager` and `DiffReviewManager` are renderers/presenters here, not the source of truth for per-session artifact provenance.

### Acceptance

- [ ] Terminal/artifact/utility auto-open behavior is driven by a single policy hook.
- [ ] Dismissed surfaces do not immediately re-open on the same event key.
- [ ] Artifact pane can show and re-open recently touched files/diffs/artifacts.
- [ ] Layout state is persisted cleanly and dead shell state is removed.
- [ ] Coverage is added for layout persistence, artifact selection precedence, history stack behavior, and auto-open suppression.
- [ ] Coverage directly proves `useChatWorkbenchLayout`, `useWorkbenchArtifacts`, `useWorkbenchSurfacePolicy`, `useArtifactHistoryStack`, and `useArtifactProvenance` contracts without shell-level mocks.
- [ ] Terminal auto-open/suppression behavior is covered at the shell level, including new-attention-key reopen behavior.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-47): Phase B — adaptive surfaces and artifact history`

---

## Phase C — Activity timeline inspector and subagent transcript drill-in

**Goal:** Replace the light summary feed with a useful inspection surface for commands, output, failures, and subagent work.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchTimelinePanel.tsx` | ~220 | Rich activity inspector for command runs, file writes, failures, approvals, and handoffs. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchTimeline.ts` | ~160 | Normalizes agent events, tool calls, approvals, and diff-review milestones into timeline entries. |
| `src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx` | ~180 | Workbench drawer panel for resolved subagent transcript drill-in. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchUtilityDrawer.tsx` | Replace the current “activity/subagents” summary-only content with timeline + transcript-capable panels. |
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchActivityPanel.tsx` | Reduce to a helper or replace entirely if `WorkbenchTimelinePanel` subsumes it. |
| `src/renderer/components/AgentMonitor/ToolCallRow.tsx` | Enrich open-subagent event detail if the selected resolver contract requires more than `toolCallId`. |
| `src/renderer/components/AgentMonitor/types.ts` | Add child-session/subagent linkage metadata if the chosen resolver contract needs it. |
| `src/renderer/components/AgentMonitor/SubagentPanelHost.tsx` | Finish resolver wiring so tool-call-driven subagent transcript lookup actually works. |
| `src/renderer/components/AgentMonitor/SubagentPanelHost.test.tsx` | Add positive-path tests for transcript resolution. |
| `src/renderer/contexts/ApprovalContext.tsx` | Expose minimal metadata/helper(s) only if needed to emit timeline entries or correlate approval resolution. |

### Subagent briefing

- **Read first:** `AgentEventsContext`, `SubagentPanelHost.tsx`, `ToolCallRow` callers of `OPEN_SUBAGENT_PANEL_EVENT`, approval and diff-review flows.
- “Timeline inspector” means inspectable entries with enough data to understand what happened. Do not just increase the count or list size.
- Subagent transcript drill-in must be real; the current `resolveByToolCallId()` returning `null` is the exact gap to close.
- Choose one resolver contract up front and write it into the implementation: either enrich the open-subagent event with session context / child session identity, or add a focused lookup API. Renderer-only “scan and hope” is not acceptable.
- Keep the workbench drawer lightweight; full raw log export is a follow-up only if needed after this richer inspector lands.

### Acceptance

- [ ] Activity tab shows a normalized timeline, not only the last 10 tool calls.
- [ ] Users can inspect failed commands/output context from the drawer.
- [ ] Subagent tab can resolve and open the correct transcript for real tool-call events.
- [ ] Coverage is added for utility-tab transitions, timeline normalization, and successful subagent transcript resolution.
- [ ] Coverage directly proves utility-tab badges, tab switching, empty states, close behavior, resolved subagent lifecycle reset, replacement after a second open, and resolver-error fallback.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-47): Phase C — timeline inspector and subagent drill-in`

---

## Phase D — Side-by-side live compare

**Goal:** Support comparing two live sessions without abandoning the chat-workbench shell.

**Guardrail:** Phase D only lands if workspace targeting is made explicit enough to keep the two panes isolated. If that prerequisite extraction does not close cleanly, compare mode should slip rather than ship on ambiguous shared state.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchComparePane.tsx` | ~220 | Secondary conversation/workspace pane for side-by-side comparison. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchCompare.ts` | ~140 | Owns compare-mode selection, focus rules, and persisted compare target. |
| `src/renderer/components/Layout/ChatOnlyShell/useScopedWorkbenchWorkspace.ts` | ~160 | Creates isolated per-pane workspace/store targeting so compare mode does not accidentally share active-thread state. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` | Mount optional compare pane and handle compare-mode layout. |
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRail.tsx` | Add compare affordance on eligible sessions. |
| `src/renderer/components/Layout/ChatOnlyShell/useChatWorkbenchLayout.ts` | Persist compare-pane open state and width if compare mode lands here. |
| `src/renderer/components/AgentChat/AgentChatWorkspace.tsx` | Audit singleton assumptions and add explicit per-pane targeting only if the scoped-workspace extraction requires it. |
| `src/renderer/components/AgentChat/useAgentChatWorkspace.ts` | Thread pane-local session/thread targeting if compare mode needs it. |

### Subagent briefing

- **Read first:** `AgentChatWorkspace.tsx`, any chat-thread focus selectors, workbench shell composition.
- This is compare mode, not arbitrary multi-pane layout. Two sessions max in this wave.
- Keep one session primary and the other secondary. Keyboard focus and message-send target must stay obvious.
- Singleton shell surfaces (artifact pane, utility drawer, adaptive auto-open policy) stay bound to the primary session unless the user explicitly promotes/swaps the secondary pane.
- Per-pane workspace state must be isolated. Do not mount a second workspace against shared active-thread state and call that compare mode.
- First iteration compare eligibility is restricted to sessions that are safe to compare under the extracted targeting model. If same-root restriction is needed to keep this coherent, write it into the phase and enforce it in UI.
- If sending from both panes creates ambiguity, restrict input to the primary pane in the first iteration and make the secondary pane inspect-only.

### Acceptance

- [ ] A second live session can be opened in side-by-side compare mode from the workbench rail.
- [ ] Primary vs secondary focus is visually clear.
- [ ] Singleton side surfaces stay owned by the primary session unless explicitly promoted/swapped.
- [ ] Per-pane workspace state is isolated; secondary selection cannot silently mutate the primary pane’s active thread/store state.
- [ ] Compare mode does not break normal single-session workbench operation.
- [ ] Compare-mode coverage includes primary-surface ownership and safe eligibility constraints.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-47): Phase D — side-by-side live compare`

---

## Phase E — HTML preview and sandbox hardening

**Goal:** Add the missing generic HTML preview path safely enough for chat-workbench artifact use.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/FileViewer/HtmlPreview.tsx` | ~180 | Sandboxed HTML preview host with explicit sandbox flags, navigation handling, and failure state. |
| `src/renderer/components/FileViewer/HtmlPreview.test.tsx` | ~160 | Unit tests for sandbox flags, source generation, and navigation blocking behavior. |
| `src/renderer/components/FileViewer/ContentRouter.test.tsx` | ~200 | Regression suite for preview/edit/history/diff/code routing precedence after HTML preview lands. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/FileViewer/ContentRouter.tsx` | Route supported HTML content into `HtmlPreview` rather than falling back to code/markdown-only behavior. |
| `src/renderer/components/FileViewer/FileViewer.tsx` | Audit for any file-type detection or preview assumptions needed by HTML preview. |
| `src/renderer/components/FileViewer/useFileViewerState.ts` | Add centralized `canPreview` / `previewKind` derivation if preview capability needs to extend beyond markdown. |
| `src/renderer/components/FileViewer/ViewModeBar.tsx` | Update preview affordance logic so HTML preview is reachable without regressing markdown/diff/history behavior. |
| `src/renderer/components/FileViewer/FileViewerChrome.tsx` | Thread preview capability/state cleanly if the view-mode logic moves here. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx` | Ensure HTML artifacts open correctly in the workbench pane. |
| `src/renderer/components/FileViewer/CLAUDE.md` | Document preview safety boundaries and supported behavior. |

### Subagent briefing

- **Read first:** `ContentRouter.tsx`, `FileViewer.tsx`, existing PDF/image/media viewer patterns.
- This is a **minimal safe preview**, not a full browser. No Node integration, no unrestricted navigation, no popup support.
- Prefer sandboxed `iframe srcDoc` or an equally constrained pattern. Block or externalize top-level navigation attempts.
- Do not use raw `dangerouslySetInnerHTML` for HTML file preview.
- Default policy forbids popups, forms, top-navigation, and privilege widening just to make pages “work.”
- Define the local-asset policy explicitly. If relative assets are unsupported in the first iteration, say so and render a clear limitation state rather than weakening sandboxing.
- If the renderer CSP or Electron environment imposes constraints, document them explicitly rather than silently widening privileges.

### Acceptance

- [ ] HTML artifacts can preview inside the workbench artifact pane.
- [ ] Preview path is sandboxed with explicit restrictions and tests.
- [ ] Unsupported navigation is blocked or intentionally handed off.
- [ ] Coverage is added for HTML preview routing and sandbox-failure / blocked-navigation paths.
- [ ] Coverage directly proves `ContentRouter` route precedence after HTML preview lands, including markdown/diff/history/editor fallback behavior.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-47): Phase E — sandboxed HTML preview`

---

## Phase F — Integration coverage, docs, and soak notes

**Goal:** Verify the real joins and document the completed workstation behavior.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchFollowThrough.integration.test.tsx` | ~260 | Real join coverage for grouped rail, adaptive surfaces, artifact history, timeline drawer, compare mode, and HTML preview routing. |
| `src/renderer/components/Layout/ChatOnlyShell/wave46CoverageCatchup.test.tsx` | ~220 | Targeted regression suite for Wave 46 behaviors that were previously covered only by smoke tests or heavily mocked joins. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.integration.test.tsx` | Stop mocking away the core joins that Wave 47 now depends on. |
| `CLAUDE.md` (root) | Update chat-workbench notes to describe the completed follow-through behavior. |
| `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` | Rewrite around the final workbench IA, surface policy, and compare mode. |
| `docs/architecture.md` | Update shell composition and workbench behavior notes. |
| `roadmap/session-handoff.md` | Record soak checklist and any remaining rollout guardrails. |

### Acceptance

- [ ] Integration tests exercise the real workbench joins rather than mocking the most important adapters away.
- [ ] Wave 46 coverage debt is explicitly closed with targeted regression tests for the missed join paths.
- [ ] Integration coverage explicitly includes terminal policy joins, artifact-policy joins, utility-drawer joins, compare-mode primary-surface ownership, session-scoped attention acknowledgement, subagent resolver scoping, and blocked HTML navigation attempts.
- [ ] Docs describe rail IA, adaptive surfaces, compare mode, timeline inspection, and preview safety accurately.
- [ ] Soak notes capture any post-wave default-flip or cleanup tasks.
- [ ] Commit: `docs(wave-47): Phase F — integration coverage and docs`

---

## Subagent execution model

All phase agents:

- **Model:** `sonnet`
- **Isolation:** sequential on `master`
- **Test policy:** scoped vitest per phase; parent runs `npx vitest run`, `npx tsc --noEmit`, and `npm run lint` at wave close
- **Lint policy:** no relaxations; keep existing complexity/size constraints intact
- **Debug policy:** after one failed speculative fix, add instrumentation or tighter tests instead of guessing
- **Commit policy:** one commit per phase, conventional commits, local-only
- **Scope discipline:** prefer shared-helper extraction over cross-shell copy/paste; stop if a phase wants new backend primitives beyond the scoped adapter gap

### Phase dispatch order

1. **Phase A** — rail IA, launcher join, attention model
2. **Phase B** — adaptive surfaces and artifact history
3. **Phase C** — timeline inspector and subagent drill-in
4. **Phase D** — side-by-side live compare
5. **Phase E** — sandboxed HTML preview
6. **Phase F** — integration coverage and docs

Phases B and C can run in parallel only if the shared event-normalization boundaries are extracted cleanly first. Otherwise serialize.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Rail grouping becomes visually busier than the current simple list.** | Keep the sections compact and sort by attention first; do not duplicate the same item in multiple sections. |
| **Adaptive auto-open becomes annoying or unpredictable.** | Centralize policy, key every trigger, and honor dismissals until a new attention key appears. |
| **Timeline inspector turns into an unbounded log viewer.** | Normalize and window entries by session; load richer detail only for the selected item. |
| **Compare mode introduces ambiguous send/focus semantics.** | Keep one clearly primary workspace; secondary can start inspect-only if needed. |
| **Subagent transcript resolution requires more context than the current event carries.** | Expand the event detail or add a small resolver IPC, but keep it focused on lookup rather than redesigning subagent tracking. |
| **HTML preview weakens renderer safety.** | Use strict sandboxing, block navigation/popups, and keep the feature scoped to local artifact preview only. |
| **The workbench accumulates too many shell-local state hooks.** | Consolidate surface policy and persisted layout state instead of adding more ad hoc booleans. |

---

## Acceptance criteria (wave-level)

- [ ] Six phase commits present on `master`.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Wave 46 coverage debt items are closed with direct tests, not just broader smoke coverage.
- [ ] Manual smoke:
  - [ ] Rail shows active sessions, background sessions, and recent chats distinctly.
  - [ ] Launching a session from the workbench rail works.
  - [ ] Background sessions surface completion / approval / failure attention.
  - [ ] Artifact pane shows recent agent-touched artifacts and re-open works.
  - [ ] Utility drawer timeline makes command/file/failure flow inspectable.
  - [ ] Subagent transcript drill-in resolves correctly.
  - [ ] Compare mode works for two live sessions without confusing the primary conversation.
  - [ ] HTML artifacts preview safely in the artifact pane.
  - [ ] The shell still feels chat-first rather than like a cramped mini IDE.

---

## Out-of-wave follow-ups

- **Flag default evaluation** for `layout.chatWorkbench` if it is still gated after Wave 47 soak.
- **Cross-window workbench attention sync** if users routinely move between multiple windows.
- **Export/share timeline snippets** if the new inspector proves useful for debugging and review.
- **Deeper per-session notification preferences** if the initial attention model needs user-level tuning.
