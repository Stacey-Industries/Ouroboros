---
status: OPEN
created: 2026-05-10
updated: 2026-05-10
---

# Diff Review artifact pane — two-column layout cannot fit diff content

## Symptom

The Diff Review artifact pane uses a two-column layout: a `CHANGED FILES (N)` list on the left, and the selected file's diff on the right. In the chat-only shell's right-side pane width (which is narrow by design), the diff column has insufficient horizontal room to render diff lines — only ~10 characters of code are visible before truncation, even though the actual diff is short (3 lines).

Surfaced during Wave 84 Phase 0 bug 2 repro (2026-05-10). Bug 2's "empty pane" defect was NOT reproducible, but this layout issue is immediately visible whenever any file is reviewed in the chat-only shell.

## Repro

1. Open the IDE in chat-only shell.
2. Ask the agent to edit any file.
3. Click "Full Review →" on the change summary bar.
4. Observe the artifact pane: file list on the left, diff on the right, both columns sharing the pane width.
5. The diff column truncates after a few characters; readable diff is impossible.

Screenshot evidence: `~/Pictures/Screenshots/Screenshot 2026-05-10 205526.png`.

## Proposed shape (for the implementer to validate)

Single-column layout:
- Each changed file is a collapsible/expandable row.
- Clicking a file row expands it inline to show the diff for that file.
- Per-file Accept/Reject buttons stay on the row header.
- No separate "diff column" — the diff renders below its file row in the same column flow.

This matches the pattern used by most modern diff viewers in narrow contexts (GitHub's mobile diff, VS Code's source-control panel when narrow). Open question for the implementer: does this generalize to wider pane widths, or should the layout adapt based on container width?

## Suspect surface

- `src/renderer/components/AgentChat/AgentChatDiffReview.tsx` — the diff review component (per Wave 84 plan).
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx` — the pane shell.
- `src/renderer/hooks/useDiffReview.ts` — file-selection state; the proposed pattern eliminates the "selected file" concept in favor of expand/collapse.

## Priority

Medium. The diff review is unusable in chat-only shell width without horizontal scrolling. Workaround: open in fullscreen / wider window where the two-column layout has room.

## Related

- `2026-05-10-diff-review-toolbar-cramped.md` — the toolbar at the top of the same pane has its own layout issue. Probably same fix surface (the artifact pane layout pass).
- The original `2026-05-07-full-review-artifact-pane-empty.md` (Wave 84 bug 2) — the "empty pane" defect that follow-up describes is NOT reproducible on current master, but this layout issue is what you see when the pane works.
