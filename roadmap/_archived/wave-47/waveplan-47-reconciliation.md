# Wave 47 — Reconciliation Report

**Date:** 2026-04-26  
**Status:** Pre-commit. Zero `feat(wave-47)` commits on master.

---

## What's Already on master (from checkpoint commits)

Several wave-47 files were landed via checkpoint commits (`b7eac3c`, `cee4e76`) rather than conventional wave commits. They exist in HEAD and should be treated as already-done:

| File | Status in HEAD |
|------|---------------|
| `useWorkbenchAttention.ts` | Present (baseline version, pre-staged improvements) |
| `useWorkbenchRecentChats.ts` | Present |
| `useWorkbenchSessionActivation.ts` | Present |
| `WorkbenchRailSections.tsx` | Present |
| `ArtifactHistoryList.tsx` | Present |
| `useArtifactHistoryStack.ts` | Present |
| `useWorkbenchSurfacePolicy.ts` | Present |
| `WorkbenchTimelinePanel.tsx` | Present |
| `useWorkbenchTimeline.ts` | Present (monolith version, pre-split) |
| `SubagentTranscriptPanel.tsx` | Present (baseline version, pre-improvements) |
| `WorkbenchRail.tsx` | Present (pre-staged improvements) |
| `ChatWorkbenchComparePane.tsx` | Present |
| `useWorkbenchCompare.ts` | Present |
| `useScopedWorkbenchWorkspace.ts` | Present |
| `ContentRouter.tsx` | Present (no `isHtml` yet — unstaged change adds it) |
| `useFileViewerState.ts` / `.helpers.ts` | Present (no `isHtml` yet — unstaged changes add it) |

---

## Phase-by-Phase Status Matrix

### Phase A — Rail IA, launcher join, background attention

**Status: PARTIALLY LANDED — uncommitted improvements in working tree + stash@{0}**

| Item | Evidence |
|------|----------|
| `useWorkbenchAttention.ts` | In HEAD (baseline). Staged improvements: `useWorkbenchAttention.helpers.ts` + `.helpers.test.ts` extract helper logic. Unstaged: `useWorkbenchAttention.ts` modified further. stash@{0} has `useWorkbenchAttention.test.ts` with 128 additional lines. |
| `WorkbenchRail.tsx` | Staged change adds `onLaunchAgent` prop + `RailHeaderActions` component with distinct "New session" / "Launch agent" buttons. stash@{0} has more WorkbenchRail.tsx changes beyond the staged. |
| `WorkbenchRail.test.tsx` | stash@{0} has 40 new lines: launcher button tests (calls `onLaunchAgent` / `onCreateSession` separately). |
| `useWorkbenchRecentChats.ts` | In HEAD. |
| `useWorkbenchSessionActivation.ts` | In HEAD. |
| `WorkbenchRailSections.tsx` | In HEAD. |
| `ChatWorkbenchShell.tsx` | NOT updated — still has `onCreateSession={() => {}}` no-op, no launcher wiring. |

**Gap:** ChatWorkbenchShell.tsx not yet wired to real activation/launcher.

---

### Phase B — Adaptive surface policy and artifact history

**Status: PARTIALLY LANDED — most files in HEAD but tests incomplete; FileViewer isHtml work unstaged**

| Item | Evidence |
|------|----------|
| `useArtifactHistoryStack.ts` | In HEAD (with test) |
| `useWorkbenchSurfacePolicy.ts` | In HEAD (with test) |
| `ArtifactHistoryList.tsx` | In HEAD |
| `useChatWorkbenchLayout.ts` | In HEAD (with test) |
| `useWorkbenchArtifacts.ts` | In HEAD (with test) |
| `ContentRouter.tsx` — `isHtml` prop | Unstaged working tree change (adds `isHtml` field to `ContentRouterProps`) |
| `useFileViewerState.ts` — `isHtml` | Unstaged working tree change |
| `useFileViewerState.helpers.ts` — `isHtml` | Unstaged working tree change |
| `FileViewerChrome.tsx` — `isHtml` wiring | In stash@{0} and stash@{1} |
| `ViewModeBar.tsx` — `isHtml` | In stash@{0} (181 line rewrite) |
| `ChatWorkbenchArtifactPane.tsx` | In HEAD — not clear if it was updated for B |

**Gap:** FileViewerChrome.tsx / ViewModeBar.tsx changes are in stash@{0} only. These are wave-47 Phase B/E work. `HtmlPreview.tsx` doesn't exist yet (Phase E new file).

---

### Phase C — Activity timeline inspector and subagent transcript drill-in

**Status: PARTIALLY LANDED — timeline split done, subagent "clear" wired, endSession defer model done; some tests uncommitted**

| Item | Evidence |
|------|----------|
| `useWorkbenchTimeline.ts` — split | Unstaged: monolith gutted, now delegates to `.entries` + `.helpers`. Working tree shows the split in progress. |
| `useWorkbenchTimeline.entries.ts` | Untracked new file |
| `useWorkbenchTimeline.helpers.ts` | Untracked new file |
| `useWorkbenchTimeline.entries.test.ts` | Untracked new file |
| `useWorkbenchTimeline.helpers.test.ts` | Untracked new file |
| `SubagentTranscriptPanel.tsx` | Unstaged: adds `onReset` to `ResolvedPanel`, "Clear selection" button |
| `ChatWorkbenchUtilityDrawer.test.tsx` | Unstaged: adds 40-line "Clear selection" test |
| `AgentMonitor/types.ts` | Unstaged: adds `pendingEnd` field to `AgentSession` |
| `useAgentEvents.endSession.ts` | Unstaged: adds `deferEnd`/`applyEnd`/`forceFinalizeEnd` for deferred parent-end |
| `useAgentEvents.helpers.ts` | Unstaged: adds `AGENT_END_FORCE_FINALIZE` action + `forceFinalizeEnd` import |
| `useAgentEvents.ruleSkillDispatchers.ts` | Unstaged: adds `setTimeout` force-finalize safety net |
| `useAgentEvents.endSession.test.ts` | Untracked new test file |
| `WorkbenchActivityPanel.tsx` | Deleted in working tree (correctly — replaced by WorkbenchTimelinePanel) |
| `WorkbenchTimelinePanel.tsx` | In HEAD (already) |
| `ChatWorkbenchUtilityDrawer.tsx` | In HEAD — unclear if it was updated to use WorkbenchTimelinePanel yet |

stash@{0} additionally has:
- `useAgentEvents.test.ts` with 61 new lines (AGENT_START on restored session, currentSessions bucketing by status)
- `useAgentEvents.ts` change (buckets `currentSessions`/`historicalSessions` by status, not `restored` flag)
- `useAgentEvents.helpers.ts` additions (restored flag clear on resume, `AGENT_END_FORCE_FINALIZE`)
- `appEventNames.ts`: adds `OPEN_MULTI_SESSION_EVENT`

---

### Phase D — Side-by-side live compare

**Status: SCAFFOLDED — key files exist in HEAD**

| Item | Evidence |
|------|----------|
| `ChatWorkbenchComparePane.tsx` | In HEAD (with test) |
| `useWorkbenchCompare.ts` | In HEAD (with test) |
| `useScopedWorkbenchWorkspace.ts` | In HEAD |
| Rail compare affordance | stash@{0} WorkbenchRail.tsx changes likely include this |
| `ChatWorkbenchShell.tsx` wiring | NOT confirmed — shell not yet wired to compare pane |
| `useChatWorkbenchLayout.ts` compare persistence | Not confirmed |

**Gap:** Integration of compare pane into ChatWorkbenchShell.tsx not verified.

---

### Phase E — HTML preview and sandbox hardening

**Status: PARTIALLY STARTED — isHtml detection added in helpers/state, ContentRouter partial, no HtmlPreview component yet**

| Item | Evidence |
|------|----------|
| `HtmlPreview.tsx` | Does NOT exist |
| `HtmlPreview.test.tsx` | Does NOT exist |
| `ContentRouter.test.tsx` | Does NOT exist |
| `ContentRouter.tsx` — `isHtml` prop | Unstaged working tree change |
| `useFileViewerState.ts` — `isHtml` | Unstaged working tree change |
| `useFileViewerState.helpers.ts` — `isHtml` | Unstaged working tree change |
| `FileViewerChrome.tsx` — threads `isHtml` | stash@{0} + stash@{1} |
| `ViewModeBar.tsx` — HTML preview mode | stash@{0} (181 lines rewrite) |
| `FileViewer/CLAUDE.md` | stash@{0} has 23 new lines for preview safety doc |

---

### Phase F — Integration coverage, docs, and soak notes

**Status: UNTOUCHED**

| Item | Evidence |
|------|----------|
| `ChatWorkbenchFollowThrough.integration.test.tsx` | Does NOT exist |
| `wave46CoverageCatchup.test.tsx` | Does NOT exist |
| `ChatWorkbenchShell.integration.test.tsx` — de-mock | Not confirmed |
| `CLAUDE.md` (root) | Not updated |
| ChatOnlyShell `CLAUDE.md` | Not updated |
| `docs/architecture.md` | Not confirmed |
| `roadmap/session-handoff.md` | Not confirmed |

---

## Stash Classification

### stash@{0} "wave-47-phase-c-wip-unstaged"

**Wave-47 content (safe to apply):**
- `useWorkbenchTimeline.*` (entries split, helpers split, tests)
- `useWorkbenchAttention.test.ts` additions
- `WorkbenchRail.test.tsx` new launcher tests
- `WorkbenchRail.tsx` further improvements
- `FileViewerChrome.tsx` — isHtml wiring (Phase E)
- `ViewModeBar.tsx` — HTML preview mode (Phase E)
- `FileViewer/CLAUDE.md` — preview doc (Phase E)
- `useAgentEvents.test.ts` — AGENT_START on restored session tests
- `useAgentEvents.ts` — status-based bucketing
- `useAgentEvents.helpers.ts` additions (restored flag clear, AGENT_END_FORCE_FINALIZE)
- `useCommandRegistrations.ts` minor addition
- `appEventNames.ts` — OPEN_MULTI_SESSION_EVENT
- `AgentMonitor/useAgentMonitorModes.ts` (22 line change — likely Phase A/C related)
- `ChatWorkbenchBody.model.ts` / `.parts.tsx` — minor additions
- `train-context/test-output-weights.json` — fixture update
- `hooksGraphUsageTap.test.ts` — import order fix (already in working tree; safe to apply but trivial)

**Wave-48 contamination (do NOT apply — already merged differently):**
- `hooksChatLaunch.ts` — wave-48 rewrite with thread-ID-scoped tracking (current HEAD uses simpler counter)
- `hooksChatLaunch.test.ts` — wave-48 test additions
- `chatOrchestrationBridgeMonitor.ts` — calls `registerChatProviderSession` / `unregisterChatProviderSession` (wave-48 APIs)
- `chatOrchestrationBridgeSend.ts` — passes thread ID to `beginChatSessionLaunch` (wave-48 signature)
- `internalMcpAutoInject.ts` — wave-48 scoped MCP
- `scopedMcpConfig.ts` / `.test.ts` — wave-48 scoped MCP

### stash@{1} "wave-47-phase-c-other-waves-wip"

**Wave-47 content (safe to apply, mostly duplicates stash@{0}):**
- `useWorkbenchTimeline.*` — same split
- `SubagentTranscriptPanel.tsx` — same "Clear selection" improvements
- `ChatWorkbenchUtilityDrawer.test.tsx` — same test additions
- `WorkbenchActivityPanel.tsx` deletion
- `WorkbenchRail.tsx` partial improvements
- `FileViewerChrome.tsx` — isHtml wiring
- `useWorkbenchAttention.ts` changes

**Wave-48 contamination:**
- `hooks.ts` — adds `registerChatProviderSession` / `unregisterChatProviderSession` re-exports and `shouldSuppressForChat` using `isActiveChatProviderSession` (wave-48 API not in current HEAD)

---

## Summary Assessment

The working tree + stash@{0} together represent a near-complete Phase A/B/C implementation with partial Phase D scaffolding and Phase E foundation work. The main gaps are:

1. **Phase A complete gap:** `ChatWorkbenchShell.tsx` not wired to real launcher/activation bridge
2. **Phase C partial gap:** working tree changes need to be committed as a unit; stash@{0} has additional `useAgentEvents.ts` / `.test.ts` changes that belong here
3. **Phase E major gap:** `HtmlPreview.tsx` component does not exist
4. **Phase F entirely missing:** All integration test files and doc updates
5. **Wave-48 contamination** in both stashes must be excluded — those APIs (`registerChatProviderSession`, `isActiveChatProviderSession`) are not in the current HEAD `hooks.ts` or `hooksChatLaunch.ts`

### Recommended approach for Step 2

1. **Stage and commit what's clean first** — the working tree changes form Phases A/B/C partial commits.
2. **Selectively apply stash@{0}** — apply the wave-47 hunks only (FileViewerChrome, ViewModeBar, useAgentEvents.ts, useAgentEvents.test.ts, appEventNames, WorkbenchRail.test) and skip the wave-48 files entirely.
3. **Drop stash@{1}** — its content is a strict subset of stash@{0} plus wave-48 contamination. Nothing unique in it worth keeping.
4. **Implement Phase E HtmlPreview.tsx** from scratch (the infrastructure (isHtml detection) is already staged).
5. **Implement Phase F** integration tests and docs.
6. **Do not attempt to apply hooksChatLaunch / chatOrchestrationBridge / internalMcp / scopedMcpConfig hunks** — these belong to wave-48's already-merged work.
