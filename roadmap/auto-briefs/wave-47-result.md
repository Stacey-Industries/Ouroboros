# Wave 47 — Chat Workbench Follow-Through: Result Brief

**Completed:** 2026-04-26  
**Branch:** master (4 phase commits + 2 close-out commits)  
**Base commit:** 4769c8c (docs: preserve overnight-waves lead-final summary)

---

## Phase summary

### Phase A — Rail IA, launcher join, and background attention
**Commit:** `1f1488e`  
**Status:** Done

Files added/modified:
- `useWorkbenchAttention.ts` + `useWorkbenchAttention.helpers.ts` + `.helpers.test.ts` — derived attention state for sessions and recent chats
- `useWorkbenchRecentChats.ts` — thread-oriented recent-chat rows (separate from session adapter)
- `useWorkbenchSessionActivation.ts` — real activation bridge via `sessionCrud.activate`
- `WorkbenchRailSections.tsx` — grouped active/background/recent-chat rendering
- `WorkbenchRail.tsx` — replaced flat list with grouped sections; distinct "New session" + "Launch agent" buttons; compare affordance

Tests run: `WorkbenchRail.test.tsx`, `useWorkbenchAttention.test.ts`, `useWorkbenchAttention.helpers.test.ts` — all pass.

### Phase B — Adaptive surfaces and artifact history
**Commit:** `ab59c97`  
**Status:** Done

Files added/modified:
- `useArtifactHistoryStack.ts` — session-scoped artifact history stack
- `useWorkbenchSurfacePolicy.ts` — single policy hook for when surfaces open; suppresses re-open loops
- `ArtifactHistoryList.tsx` — history stack rendering with selection
- `useChatWorkbenchLayout.ts` — persisted layout state; dead `terminalOpen` removed
- `useWorkbenchArtifacts.ts` — explicit selection model with session-scoped provenance
- `ChatWorkbenchArtifactPane.tsx` — artifact history integration

Tests run: `useArtifactHistoryStack.test.tsx`, `useWorkbenchSurfacePolicy.test.tsx`, `useChatWorkbenchLayout.test.tsx`, `useWorkbenchArtifacts.test.tsx` — all pass.

### Phase C — Activity timeline inspector and subagent transcript drill-in
**Commit:** `31c39ff`  
**Status:** Done

Files added/modified:
- `useWorkbenchTimeline.ts` — decomposed into `.entries.ts` + `.helpers.ts` modules
- `useWorkbenchTimeline.entries.ts` + `.helpers.ts` + respective test files — normalized timeline entry building
- `WorkbenchTimelinePanel.tsx` — timeline inspector for the utility drawer
- `SubagentTranscriptPanel.tsx` — transcript drill-in with `onReset` / "Clear selection"
- `ChatWorkbenchUtilityDrawer.tsx` — wired to timeline panel and transcript panel
- `AgentMonitor/types.ts` — `pendingEnd` field on `AgentSession`
- `useAgentEvents.endSession.ts` + `useAgentEvents.helpers.ts` + `useAgentEvents.ruleSkillDispatchers.ts` — deferred parent-end model
- `WorkbenchActivityPanel.tsx` — deleted (subsumed by WorkbenchTimelinePanel)

Tests run: `useWorkbenchTimeline.entries.test.ts`, `useWorkbenchTimeline.helpers.test.ts`, `useWorkbenchTimeline.test.ts`, `ChatWorkbenchUtilityDrawer.test.tsx` — all pass.

### Phase D — Side-by-side live compare
**Commit:** `<Phase D SHA>` (doc-only — scaffolding already on master via checkpoint commits)  
**Status:** Done (wiring confirmed, no new code required)

Files already on master (landed via checkpoint commits before this wave's phase commits):
- `ChatWorkbenchComparePane.tsx` — secondary inspect-only workspace pane
- `useWorkbenchCompare.ts` — eligibility rules and compare-target state
- `useScopedWorkbenchWorkspace.ts` — isolated per-pane store via `useRef(createAgentChatStore()).current`
- `ChatWorkbenchBody.model.ts` — calls `useWorkbenchCompare`, wires compare state through
- `ChatWorkbenchBody.parts.tsx` — mounts `ChatWorkbenchComparePane` conditionally

Verified: compare pane renders when `compare.compareTarget` is non-null; scoped store prevents shared active-thread state; secondary pane is inspect-only (`readOnly={true}` passed to `AgentChatWorkspace`).

Tests run: `ChatWorkbenchComparePane.test.tsx`, `useWorkbenchCompare.test.tsx` — all pass.

### Phase E — HTML preview and sandbox hardening
**Commit:** `587c0ac`  
**Status:** Done

Files added/modified:
- `FileViewer/HtmlPreview.tsx` — strict `<iframe srcDoc sandbox="">` with no script/navigation/popup/form permissions
- `FileViewer/ContentRouter.tsx` — routes `isHtml` before `isMarkdown`; `.html`/`.htm` files get sandboxed preview
- `useFileViewerState.ts` + `useFileViewerState.helpers.ts` — `isHtml` / `canPreview` derivation
- `FileViewer/CLAUDE.md` — documented preview safety boundaries

Tests run: `HtmlPreview.test.tsx`, `ContentRouter.test.tsx` — all pass.

### Phase F — Integration coverage, docs, and soak notes
**Commit:** `<Phase F SHA>`  
**Status:** Done

Files added/modified:
- `ChatWorkbenchFollowThrough.integration.test.tsx` (new) — 6 integration tests covering shell structure, rail IA (New session + Launch agent buttons), utility drawer subagent event join, compare pane inactive state, and primary workspace mount
- `useChatWorkbenchLayout.ts` — `railOpen` default changed from `false` to `true` (rail is the primary navigation surface)
- `useChatWorkbenchLayout.test.tsx` — test assertions updated to match new default
- `docs/architecture.md` — Wave 47 workbench description updated
- `docs/chat-shell.md` — full Wave 47 workbench feature summary added
- `ChatOnlyShell/CLAUDE.md` — composition tree updated; Wave 47 phase roadmap added
- `roadmap/session-handoff.md` — soak checklist for Wave 47 post-ship evaluation
- `roadmap/auto-briefs/wave-47-result.md` (this file)

Tests run: `ChatWorkbenchFollowThrough.integration.test.tsx` (6 tests pass), full `ChatOnlyShell/` suite (325 tests pass).

---

## Feature flags introduced

- None new. Existing `layout.chatWorkbench` gates the entire workbench shell. All Wave 47 features are inside that gate. `railOpen` default changed to `true` — this is a UI default, not a feature flag.

---

## Deferred items

| Item | Reason |
|---|---|
| `wave46CoverageCatchup.test.tsx` | Plan called for it; coverage provided instead by `ChatWorkbenchFollowThrough.integration.test.tsx` which covers the same join paths. Separate file not needed. |
| Rail compare affordance in `WorkbenchRail.tsx` | Props are wired (`canCompareSession`, `onCompareSession`, `compareSessionId`) and rendered via `WorkbenchRailSections`. Smoke-tested at unit level; no additional integration test needed. |
| `layout.chatWorkbench` flag default flip | Deferred to post-soak per the Wave 47 plan's explicit guidance. See `roadmap/session-handoff.md` soak checklist. |
| Cross-window workbench attention sync | Wave 47 plan called this an out-of-wave follow-up. Still deferred. |
| Timeline entry window tuning | `useWorkbenchTimeline` entries are windowed. Appropriate window size requires production data — deferred to soak observation. |
| Export/share timeline snippets | Out-of-wave follow-up per the plan. Deferred. |

---

## Stash hygiene

Both `stash@{0}` ("wave-47-phase-c-wip-unstaged") and `stash@{1}` ("wave-47-phase-c-other-waves-wip") were save-points created during wave execution. Their wave-47 content is fully represented in the phase commits. Both contain wave-48 contamination (hooksChatLaunch, chatOrchestrationBridge, internalMcp, scopedMcpConfig) which is already merged differently. Both stashes should be dropped after this brief is committed.

---

## Test counts

- `ChatOnlyShell/` suite: 325 tests, all passing
- TypeScript (`npx tsc --noEmit`): clean (0 errors)
