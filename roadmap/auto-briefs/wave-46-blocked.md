# Wave 46 — BLOCKED

**Teammate:** wave-46-impl (Opus 4.7)
**Started:** 2026-04-26 ~05:05 local
**Stopped:** 2026-04-26 ~05:20 local
**Branch policy followed:** never pushed, never fetched, never merged, never touched master.

## TL;DR

Wave 46 was already substantively shipped to `master` before this overnight run.
The only Phase F item still missing was workbench-aware command palette
filtering, which I drafted and tested in isolation but could **not commit on
`auto/wave-46`** because the assigned single worktree at `C:/Web App/Agent IDE`
is being shared with at least one peer teammate (`auto/wave-53`) whose
mid-flight, uncommitted edits are present in the shared index and worktree.
Any commit I attempt on `auto/wave-46` would either (a) corrupt the wave-53
teammate's WIP, or (b) require `--no-verify` plus committing alongside another
team's unrelated changes, which violates the brief's independence requirement.

I have stopped rather than guess past this. The Phase F refinement code is
preserved as artifacts (see "Preserved artifacts" below) so the parent on
wake can either pick it up directly or reassign once worktree isolation is
fixed.

## What is already on `master` for Wave 46

Validated on `master` at `47990085` (the wave-46 base):

| Plan deliverable | Path | Status on master |
|---|---|---|
| `layout.chatWorkbench` config flag (default `false`) | `src/main/configSchemaTailExt.ts:26,37`, `src/main/configTypes.ts:288`, `src/renderer/types/electron-foundation.d.ts:246` | shipped |
| Phase A — workbench shell scaffold | `ChatWorkbenchShell.tsx`, `useChatWorkbenchLayout.ts`, `useChatWorkbenchFlag.ts` | shipped |
| Phase B — session-first rail | `ChatWorkbenchBody.parts.tsx` (WorkbenchRailSurface), `useWorkbenchSessions.ts`, `useWorkbenchRecentChats.ts`, `useWorkbenchAttention.ts` | shipped |
| Phase C — terminal dock | `ChatWorkbenchTerminalDock.tsx`, `useTerminalDockState.ts` | shipped |
| Phase D — artifact pane | `ChatWorkbenchArtifactPane.tsx`, `useWorkbenchArtifacts.ts`, `useArtifactHistoryStack.ts` | shipped |
| Phase E — utility drawer | `ChatWorkbenchUtilityDrawer.tsx`, `WorkbenchActivityPanel.tsx`, `WorkbenchTimelinePanel.tsx`, `SubagentTranscriptPanel.tsx` | shipped |
| Phase F — integration test | `ChatWorkbenchShell.integration.test.tsx` | shipped |
| Phase F — docs | `docs/architecture.md:167`, `docs/chat-shell.md:22`, `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` | shipped |

Verification I ran successfully on the wave-46 base (`master @ 47990085`)
**before** discovering the shared-worktree problem:

- `npx tsc --noEmit -p tsconfig.json` — clean exit.
- `npx vitest run src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.integration.test.tsx src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.test.tsx` → 2 files, 20 tests, all green.
- After the Phase F filter was added: `npx vitest run` over the new filter test
  + 4 existing chat-only/workbench tests → 5 files, 40 tests, all green.

In other words: **Wave 46 is shipped.** What is left is one cosmetic refinement
(below) and the parent-only flag flip from `false` to `true` after soak
(explicitly out-of-scope for the teammate per the plan).

## What I tried to add and why

The plan's risk table called out that "Workbench command palette exposes
IDE-only commands that are nonsensical in this shell" and Phase F listed
"Filter commands by shell capability." That filtering was not on master — the
chat-only and chat-workbench shells both pass the unfiltered `commands` array
straight to `<CommandPalette>`, including:

- `view:toggle-sidebar` — dispatches `agent-ide:toggle-sidebar`, which the
  workbench shell does not listen for (verified by grep).
- `view:toggle-agent-monitor` — same; no listener in workbench mode.
- `view:split-editor` — no editor in chat shells.
- `git:time-travel` — IDE-only `agent-ide:open-time-travel` listener.
- `git:review-all-changes`, `git:review-unstaged-changes` — IDE-only.

Showing those in the chat-shell palette is a no-op trap.

### Refinement implemented (uncommitted)

- New file: `src/renderer/components/Layout/ChatOnlyShell/chatOnlyCommandFilter.ts`
  — pure `filterCommandsForChatShell(commands)` that strips the six IDs above.
- New file: `src/renderer/components/Layout/ChatOnlyShell/chatOnlyCommandFilter.test.ts`
  — 4 vitest cases (drops disabled, preserves allowed, no input mutation,
  internal disabled-id set sanity).
- Edit: `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` —
  add `useMemo` import, add `filterCommandsForChatShell` import, run
  `commands` through the filter once before passing through `args.commandApi`.
  Five lines net, plus a two-line comment.

All three changes pass:
- `npx tsc --noEmit -p tsconfig.json` (project-wide).
- `npx vitest run` over the new test plus all existing
  ChatOnlyShell/ChatWorkbenchShell tests (5 files / 40 tests).
- Local eslint on the three files.

## The blocker

`git worktree list` reports:

```
C:/Web App/Agent IDE                                     <SHA> [auto/wave-53]
C:/Web App/Agent IDE/.claude/worktrees/romantic-meitner  d2a9d97 [claude/romantic-meitner]
C:/Web App/wave-48-tree                                  4799008 [auto/wave-48] locked
```

Wave 48 has a dedicated worktree. Wave 53 and wave 46 do **not**. They share
`C:/Web App/Agent IDE`. By the time I attempted to commit my filter files on
`auto/wave-46`, the wave-53 teammate had already started writing into the
shared index and worktree:

- 7 staged file modifications under `src/main/agentChat/`, `src/main/router/`,
  `src/main/configSchema*`, `src/main/telemetry/` — all wave-53 territory.
- Several untracked files (`goalClassifier.ts/.test.ts`).
- `git checkout` events in the reflog showing the worktree being toggled
  between `auto/wave-46` → `auto/lead-log` → `auto/wave-48` → `auto/wave-53`
  during my session, by some external process (presumably the team-lead or
  the wave-53 teammate).

Consequences:

1. My uncommitted edit to `ChatOnlyShell.tsx` was reverted by an external
   `git checkout` after I made it (the post-edit hook system reminder
   confirmed the file was modified externally).
2. The shared index now contains wave-53's staged changes on the same branch
   I would commit on. Switching back to `auto/wave-46` carries those staged
   changes with me (both branches point to `4799008`, so the switch is
   metadata-only and the index and worktree do not reset).
3. Pre-commit gates (`assets/hooks/pre_commit_lint.mjs`) run project-wide
   `tsc --noEmit -p tsconfig.web.json` and `tsconfig.node.json`. Wave-53's
   in-flight edits introduce a TS error
   (`Property 'shadowMode' does not exist on type 'RouterSettings'`) which
   correctly belongs to wave-53's not-yet-complete work. That error blocks
   any commit I attempt — including a wave-46 commit that is unrelated to
   the affected files — until wave-53 finishes.
4. The "right" workaround is `git stash`, but stashing another teammate's
   staged WIP without their knowledge is invasive and out of scope per the
   brief ("Do not touch master. Do not depend on their work. Do not
   message them."). Committing `--no-verify` would land my changes alongside
   wave-53's WIP in the same dirty index, which is worse.

## Preserved artifacts

The Phase F filter files are preserved at:

- `roadmap/auto-briefs/wave-46-artifacts/chatOnlyCommandFilter.ts`
- `roadmap/auto-briefs/wave-46-artifacts/chatOnlyCommandFilter.test.ts`

The required `ChatOnlyShell.tsx` patch (also preserved here for clarity) is:

```diff
-import React, { useCallback, useEffect, useRef, useState } from 'react';
+import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
@@
 import { ChatHistorySidebar } from './ChatHistorySidebar';
+import { filterCommandsForChatShell } from './chatOnlyCommandFilter';
 import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';
@@
   const { commands, recentIds, execute } = useCommandRegistry();
+  // Wave 46 Phase F: filter IDE-only commands that are no-ops in chat-only and
+  // chat-workbench shells (toggle-sidebar, split-editor, in-shell git review).
+  const filteredCommands = useMemo(() => filterCommandsForChatShell(commands), [commands]);
@@
-    commandApi: { commands, recentIds, execute },
+    commandApi: { commands: filteredCommands, recentIds, execute },
```

To finish Wave 46 cleanly the parent (or whichever teammate is dispatched
next) can: copy the two artifact files into
`src/renderer/components/Layout/ChatOnlyShell/`, apply the four-hunk diff
above, run `npx vitest run src/renderer/components/Layout/ChatOnlyShell/`,
and commit on a clean `auto/wave-46`. Total work: <5 minutes once worktree
isolation is restored.

## Recommendation for the team-lead

The overnight-waves dispatch needs a dedicated worktree per teammate, the
same way `wave-48-tree` was set up for wave-48. Sharing one worktree across
serial branch switches between live agents is not safe — the index, the
worktree files, and the post-tool hooks all assume single-branch ownership.
At minimum:

```bash
git worktree add ../wave-46-tree auto/wave-46
git worktree add ../wave-53-tree auto/wave-53
```

Done before dispatch, this would have allowed all three teammates to commit
in parallel without cross-contamination.

## Time spent

~45 minutes total: ~20 reading the plan and validating against current
state, ~15 implementing the Phase F filter and tests, ~10 diagnosing the
shared-worktree corruption and writing this note. Hard stop is 08:45 — well
within budget. Stopping now is deliberate, not a time-out.
