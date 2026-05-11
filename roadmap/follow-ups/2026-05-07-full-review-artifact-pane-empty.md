---
status: OPEN
created: 2026-05-07
updated: 2026-05-07
---

# Full Review opens artifact pane but renders nothing

## Symptom

In the chat-only shell, when the agent has finished a turn that modified files, the change summary bar shows a "Full Review →" button. Clicking it opens the artifact pane (right side) but the pane is empty — no diff renders, no file list, no error message. Visual: the pane chrome appears, the content area is blank.

## Repro (rough — to be tightened during B0)

1. Open the IDE, chat-only shell.
2. Send the agent a message that causes file edits (e.g. "rename this variable").
3. After the agent finishes, the `CompletedChangeSummaryBar` renders with file tally + "Full Review →".
4. Click "Full Review →".
5. Artifact pane opens on the right but its content area is empty.

## Suspect surface

- `src/renderer/components/AgentChat/ChangeSummaryBar.tsx:140-144` — `dispatchDiffReview` fires `agent-ide:open-diff-review` CustomEvent with `{ sessionId, snapshotHash, projectRoot, filePaths }`.
- `src/renderer/components/AgentChat/ChangeSummaryBar.tsx:157-160` — `openFullReview` callback wiring.
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx` — the pane that opens. Subscribes to `agent-ide:open-diff-review`?
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRightPane.tsx` — pane shell.
- `src/renderer/components/AgentChat/AgentChatDiffReview.tsx` + `useDiffReview.ts` — the diff review component that should render inside the pane.
- `src/renderer/hooks/appEventNames.ts` — confirm `agent-ide:open-diff-review` is the canonical event name.

## Likely failure modes (to enumerate during B1, not fix yet)

1. The event listener that maps `agent-ide:open-diff-review` to "open the artifact pane in diff-review mode" fires but the artifact pane's content slot isn't being told which renderer to mount.
2. The pane opens via a different code path (auto-open on something) and the diff-review payload never reaches the slot.
3. `AgentChatDiffReview` renders but consumes `sessionId`/`snapshotHash` that don't resolve in the artifact-pane context (different React tree, missing provider).
4. Snapshot-hash → file-content lookup IPC returns empty before the user-facing render commits, so the pane shows "no diff" with no error toast.
5. The pane's open-state and the diff-review's mount-state desync — one fires, the other doesn't.

## Investigation plan (when picked up)

Per `~/.claude/rules/debug-before-fix.md`, instrument first:

1. `log.info('[trace:full-review] click', { sessionId, snapshotHash, projectRoot, fileCount })` at `dispatchDiffReview` call site.
2. `log.info('[trace:full-review] event received', payload)` in whatever component listens for `agent-ide:open-diff-review`.
3. `log.info('[trace:full-review] artifact-pane mount', { mode, payload })` at the artifact pane's content slot.
4. `log.info('[trace:full-review] diff-review render', { hasFiles, sessionId, snapshotHash })` in `AgentChatDiffReview` body.
5. Compare which logs fire and where the chain breaks. Only after observing the divergence, propose a fix.

## Priority

Medium — visible feature regression but workaround exists (expand the change summary's per-file list to see individual diffs). User flagged "to follow up on later" — Wave 84 (Cypher engine quality) takes the next slot.

## Related

- Wave 82.1 (chat-project-binding) and Wave 82 (chat-only polish) recently touched the artifact-pane wiring. Verify whether either changed how `agent-ide:open-diff-review` is consumed.
- Adjacent open follow-up: `2026-05-07-context-preview-rules-disappear-after-chat-start.md` — also a chat-only-shell post-chat-start state-loss bug. May share a root cause around session-binding side effects.
