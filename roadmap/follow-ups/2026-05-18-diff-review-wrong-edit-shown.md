---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 Phase E end-to-end smoke (post-bugs A-E fix)
---

# Diff-review panel showed wrong edit (post_tool_use leakage)

Surfaced during Wave 94 Phase E smoke (Cole, 2026-05-18):

> "Edit showed up, not the exact right thing showed though, it showed an
> edit to a post tool use."

User asked claude to edit `package.json`. The diff-review panel opened
and the changed-files list DID include `package.json`, but the
highlighted/initial diff content shown was for a different file — Cole
described it as "an edit to a post tool use," which suggests the panel
surfaced a stale or wrong-correlated diff first, even though the right
file was in the list.

## Possible root causes (to investigate, not guess)

1. **Stash key collision when multiple Claudes run simultaneously.** Bug
   C's fix uses `sessionId:tool_use_id` as the stash key, which should
   be globally unique. But if the stash size cap (100 entries) evicts
   entries oldest-first AND the cap is hit faster than Cole expected,
   stale snapshots might persist past their useful window. Verify by
   checking `stashSize` from the trace logs at the moment of the wrong
   diff.

2. **Race between `diff_review_ready` events from concurrent claudes.**
   The trace shows multiple Claude UUIDs firing PreToolUse/PostToolUse
   back-to-back. If the panel just opens the "most recent" diff event
   rather than scoping to the per-terminal active session, edits from
   other terminals could leak in.

3. **The "post tool use" wording suggests the diff shown was actually
   the result of a Bash tool call output capture or similar** — i.e.,
   the hook script captured something it shouldn't have (a tool whose
   "edit" isn't a file write). Audit which tools trigger snapshot
   stashing in `hooksDiffReview.ts` — the filter should be Edit/Write/
   MultiEdit/NotebookEdit only, not all tool calls.

## Reproduction steps (for the diagnostician)

1. Start fresh `npm run dev`.
2. Open two terminals.
3. In terminal A, run `claude` and ask it to edit `package.json` in the
   current project.
4. In terminal B, run `claude` and ask it to run a `Bash` command (e.g.,
   `git status`) — something that ISN'T a file write.
5. Observe the diff-review panel. The expected behavior: terminal A's
   `package.json` edit shows; terminal B's Bash call produces no diff.
6. The bug: terminal B's tool call somehow surfaces a "diff" in the
   panel for terminal A's session.

If repro 5/6 doesn't surface it, vary timing and tool types until the
"post tool use" wording matches what Cole saw.

## Why not Wave 94

Wave 94's scope was the producer/consumer pipeline. We have evidence
the pipeline works end-to-end (snapshot stashed → emit → panel opens).
This issue is at a different layer — content selection / filter scope.
Diagnose with proper instrumentation in Wave 95, don't grind it as
another producer bug.

## Hooks for the diagnostician

- `src/main/hooksDiffReview.ts` — what tool names does `handlePreToolUse`
  accept? Filter to file-modifying tools only.
- The diff-review panel's "active diff" selection logic — probably under
  the same component as the layout/grouping work.
- The `stashSize` log from Bug C's trace, if re-instrumented, will show
  whether eviction is racing.

## Why this matters

A diff-review panel that occasionally shows the WRONG file is worse than
one that doesn't show at all — users will reject correct edits because
they don't trust the surface. Must be fixed before the feature is
relied on for production review workflows.

Estimate: 1–2 hours diagnose (Lane B B0–B2), then 1–3 files fix.
