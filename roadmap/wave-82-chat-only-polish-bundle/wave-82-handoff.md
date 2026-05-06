# Wave 82 — Session Handoff

**Date:** 2026-05-03
**For:** the next agent who picks up this work after Cole returns from his smoke-test session.

This doc is self-contained — read it before reading anything else.

---

## TL;DR (60 seconds)

Wave 82 is a **post-smoke iteration round 2** that closed 9 of 11 issues Cole flagged during his first smoke walk. Two items are deferred to his next smoke (one needs runtime conditions I couldn't reproduce, one needs a clarifying question answered). Nothing has been pushed to GitHub. When Cole returns, he walks the round-2 smoke checklist and reports what (if anything) is still broken. Then iterate, push, tag.

**Critical context:** all session work is in the working tree. Run `git status` to see ~43 changed files. Do NOT push without Cole's explicit OK.

---

## Where things stand

### Files in the working tree (not committed, not pushed)

```
roadmap/wave-82-chat-only-polish-bundle/
├── waveplan-82.md             — original plan
├── wave-82-decisions.md       — locked ADR (12 decisions)
├── phase-a-audit.md           — architect deliverable (wiring matrix etc.)
├── phase-e-diagnosis.md       — diagnostic findings for runtime-bug threads
├── wave-82-auto-brief.md      — result brief (round 1 + round 2 patch log)
└── wave-82-handoff.md         — THIS FILE

roadmap/follow-ups/outstanding-2026-05-03.md   — categorized digest of ~140 still-open items

src/   — 31 modified files + 5 new files. Touch points:
  AgentChat:           ContextPreview, ComposerContextPreview, AgentChatComposer.helpers,
                       imageAttachmentSupport, agentChatWorkspaceSupport
  FileViewer:          FileViewer, FileViewerToolbar, useFileViewerState.effects,
                       MonacoEditor.hooks
  Layout/ChatOnlyShell: ChatOnlyStatusBar, ChatHistorySidebar, OuterProjectRail,
                       ChatWorkbenchBody (and .rails / .model ancillaries),
                       ChatWorkbenchShell, ChatWorkbenchArtifactPane,
                       ArtifactHistoryList, useArtifactHistoryStack,
                       WorkbenchTimelinePanel, useWorkbenchTimeline,
                       useWorkbenchRailActions, useWorkbenchMenuEvents (NEW),
                       InnerSidebar, InnerSidebarTerminals,
                       ChatWorkbenchTerminalDock
  Layout (root):       StatusBar, TitleBar.workbench.menus, TitleBar.menus.test
  hooks:               useFileHeatMap, useAgentEvents.helpers,
                       useAgentEvents.ruleSkillReducers,
                       useAgentEvents.ruleSkillDispatchers, useContextPreview
```

### Quality gates

- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors, 3 pre-existing warnings (none in Wave 82-touched files)
- Scoped vitest: every test file I touched passes
- Full vitest baseline: 6 pre-existing failures unchanged (mobile-touch-targets, channelCatalogCoverage, preloadParity, TitleBar.menus "Switch to IDE Shell", ChatWorkbenchShell "subagents tab", ChatWorkbenchFollowThrough OPEN_SUBAGENT_PANEL_EVENT). **Zero Wave 82 regressions.**

---

## What Cole tested in round 1 + how it was patched in round 2

Cole's annotated brief (`wave-82-auto-brief.md`, lines 78-106) flagged 11 items. Round 2 patches:

| #   | Item                                    | Round 2 patch                                                                                                                                                                                                                 |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B3  | Branch still in status bar              | `ChatOnlyStatusBar.GitBranchItem` removed (the round-1 fix only got `StatusBar.tsx` in IDE shell)                                                                                                                             |
| C1  | Chat add/delete flashes                 | Root cause: `useReloadThreads` cleared `setThreads([])` before refetch → brief "No chats yet" empty state. Switched to optimistic update — only setThreads after new data arrives. (`agentChatWorkspaceSupport.ts:103-135`)   |
| C3  | "Set as active" unclear                 | DEFERRED — clarification needed. Logic for desync clearing IS in place (`useActiveProjectValidator` in `ChatWorkbenchBody.rails.tsx`). Cole asked: "is there an indicator/flag for that?" — needs a UX answer before fix.     |
| F1  | Edit toolbar disappears after Exit      | Defensive fix in `FileViewer.renderInitialViewerState` (`FileViewer.tsx:48-58`) — when `filePath` is set but `content` is briefly null, fall through to chrome instead of EmptyState. Toolbar persists across the transition. |
| F1c | Minimap dual-scroll                     | Also disabled `overviewRulerLanes`/`overviewRulerBorder` (`MonacoEditor.hooks.ts:89-104`). Round-1 only hid `scrollbar.vertical`.                                                                                             |
| F2  | Project switch doesn't refresh chat     | `ChatWorkbenchBody.useBodyContent` now passes `layout.activeProject ?? props.projectRoot` to children (`ChatWorkbenchBody.tsx:120-138`). Workspace re-mounts on rail switch.                                                  |
| F4  | New Session opens dead launcher         | Removed `OPEN_MULTI_SESSION_EVENT` redirect from `useWorkbenchMenuEvents`. Added `useNewSessionMenuListener` inside `ChatWorkbenchBody` that calls `handlers.handleCreateSession(layout.activeProject)` directly.             |
| G   | Artifact pane top strip + Recent        | Both removed entirely. Empty-state retains its own small close × in a header.                                                                                                                                                 |
| G   | Timeline session content not scrollable | Added `min-h-0` to `TimelineGroupList` flex chain + `max-h-[50vh] overflow-y-auto` on per-session expanded content.                                                                                                           |
| H2  | Image attachments invisible             | `attachments` now flows through `buildChatOnlyContextPreviewProps` → `ComposerContextPreview` → `useContextPreview`. `buildFileItems` includes them as `attachment:` id-prefixed entries in the Files tab.                    |
| B2  | Heat map                                | DEFERRED — fix is in (`useFileHeatMap.extractFilePath` JSON parse). Cole was unsure if his earlier work counted as "agent edits"; will re-verify by triggering an in-app Claude tool call and checking for colored borders.   |

---

## Round 2 smoke checklist (for Cole on return)

When Cole comes back, walk these. Each should now pass:

1. **B3** — Open chat-only view. The bottom status bar should NOT show "master" (or any branch name). The branch is only at the top of the file tree.
2. **C1** — Right-click a chat → Delete. The row vanishes in a single visual update with **no empty-state flash** ("No chats yet" should never appear during the cycle).
3. **C1** — Click "+ New chat". Same: no flash, no momentary empty state.
4. **F1** — Open a file in artifact pane → press Edit → press Exit. All 5 toolbar buttons (Edit, Minimap, Blame, Outline, History) remain present and clickable.
5. **F1c** — Toggle Minimap ON. Should see ONLY the minimap on the right edge — no separate decoration ruler canvas, no separate vertical scrollbar.
6. **F2** — In chat-only workbench, click Agent IDE in the rail → start a new chat. Then click Contractor App in the rail → click "+ New chat". The chat workspace should re-bind to Contractor App (not stay on Agent IDE).
7. **F4** — File menu → New Session. Should NOT open the multi-session launcher overlay. Should create a session in the active project and open a fresh chat thread.
8. **G** — Artifact pane: open a file. There should be NO top strip showing "filename × Close" and NO "Recent" section. Just the file viewer tabs row + content.
9. **G (Timeline)** — Utility drawer → Activity tab. Sessions group properly; expanding a session reveals its events. Both the outer session list AND each session's expanded entries should scroll.
10. **H2** — Drop an image into the composer. It should appear in the Files tab of the popover (alongside any pinned files).

### Items left from round 2

11. **B2 (heat map)** — Trigger a Claude tool call (`Edit`, `Write`, `NotebookEdit`) from in-app chat. After the call completes, the file-tree row for the edited file should show a colored left-border (warm/hot/fire). Toggle the heat-map button on/off — borders should appear/disappear.
12. **C3 (set-active)** — Cole's question to answer: "There is no set as active open in the UI, the project should just be the active one if I have it selected if there is such an indicator/flag for that?" The UX intent is: when a project is selected in the rail, the rail icon highlights (already happens). The desync-clearing kicks in if you remove the active project — it should auto-clear so no orphan reference remains. Cole should test: select Contractor App → right-click in outer rail → Remove from rail. The inner sidebar should reset to "Select a project to view its chats."

---

## What you (next agent) should do

### If Cole reports more issues

For each issue:

1. Reproduce in dev build (`npm run dev` from `C:\Web App\Agent IDE\`).
2. Find the root cause via code reading + targeted instrumentation (not via "try a fix and see").
3. Apply minimal-surface fix.
4. Run scoped tests (`npx vitest run <touched-test-file>`), then `npx tsc --noEmit`, then `npm run lint`.
5. Append the patch to the round-2 patch log in `wave-82-auto-brief.md`.

### If everything passes smoke

1. Confirm with Cole that the wave is sign-off ready.
2. Run full quality gates one more time: `npx tsc --noEmit`, `npm run lint`, `timeout 480 npx vitest run`.
3. Stage and commit. Suggested commit message style (see `git log --oneline -5` for the project's style):
   ```
   release(v2.13.0): wave 82 — chat-only polish bundle (15 user-reported bugs)
   ```
4. Push: `git push origin master`.
5. Tag: `git tag v2.13.0 && git push --tags`.
6. Update `roadmap/session-handoff.md` (project-level handoff doc) with a one-line entry pointing to wave 82's brief.

### If the wave gets fragmented (some fixes ship, some don't)

Open a Wave 82.1 follow-up file at `roadmap/wave-82.1-{slug}/` for the deferred work. Move the unfixed-item entries from `wave-82-auto-brief.md` into the new wave's plan.

---

## Things to NOT do

- **Do not push without Cole's OK.** He explicitly held push pending his smoke walk.
- **Do not run `git stash` or `git reset --hard`** to "clean up" — every modified file in the working tree is intentional. The 43-file change set is the wave.
- **Do not amend the previous commit (Wave 81's release).** Wave 82 gets its own commit(s).
- **Do not pre-emptively bump version numbers.** Cole picks the tag value when he greenlights.
- **Do not touch B2's `useFileHeatMap.extractFilePath` again** unless Cole's re-test surfaces a new symptom — the fix is in, just needs runtime data.
- **Do not redesign the artifact pane further** — Cole's round-2 feedback was "remove these elements", which is done. Don't add things back without his ask.

---

## Useful commands quick reference

```bash
# from C:\Web App\Agent IDE\

# Dev server (hot-reload renderer; main needs restart)
npm run dev

# Quality gates
npx tsc --noEmit
npm run lint
timeout 480 npx vitest run                    # full suite
npx vitest run path/to/touched.test.ts        # scoped (preferred during iteration)

# What changed this session
git status
git diff --stat
git diff src/path/to/file

# Where things live
ls roadmap/wave-82-chat-only-polish-bundle/   # Wave 82 docs
cat roadmap/wave-82-chat-only-polish-bundle/wave-82-auto-brief.md   # full result brief
cat roadmap/follow-ups/outstanding-2026-05-03.md                    # what else is open
```

---

## Wave 82 narrative arc (for context)

1. Cole did a 15-bug user-driven hunt across the chat-only / workbench surfaces.
2. We cataloged each bug as a TaskCreate item, then converted to a structured wave plan with 12 ADR decisions (4 of which Cole locked).
3. Autonomous execution closed all 10 phases (A through J) with 31 modified + 5 new files. Code-complete, smoke-pending.
4. Cole did smoke round 1, found 11 things still broken or partial. Annotated the brief inline.
5. Round 2 patches closed 9 of those 11; 2 deferred to round 3 (this is where you come in).
6. Next: Cole's round-3 smoke → either ship or iterate.

Cole is a non-engineer product owner working with agent-driven development; my role is technical lead. He values:

- Quality over speed (no rushing to ship)
- Honest acknowledgement when something didn't work
- Decisive fixes when the root cause is clear (don't hedge)
- Brief, scannable status updates (not walls of text)

He explicitly said earlier: "Don't suggest breaks" — don't propose pausing or "good stopping points." He manages his own time.

---

Good luck. The hard part is done — what's left is whatever the smoke walk turns up, plus shipping.
