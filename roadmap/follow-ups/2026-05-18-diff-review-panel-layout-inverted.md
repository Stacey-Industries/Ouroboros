---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 Phase E end-to-end smoke (post-bugs A-E fix)
---

# Diff-review panel layout — file list dominates, code unreadable

Surfaced during Wave 94 Phase E smoke (Cole, 2026-05-18), after the 5
producer/consumer bugs (A–E) were resolved and `diff_review_ready`
events started landing end-to-end.

## Symptom

When the diff-review panel opens (terminal-launched claude → edit → panel
auto-opens), the layout is inverted from the industry-standard pattern:

- Changed-files list occupies ~80% of the panel width
- Diff code occupies ~20% — effectively unreadable, only 10–15 chars wide
  before wrapping

The expected pattern (VS Code source control, GitHub PR diff viewer,
GitLens): file list at ~20–25% width, diff code at ~75–80%, with a
draggable splitter.

## Likely root cause

CSS layout bug — almost certainly a `flex: 1` or `width: 80%` on the
wrong side of the panel split. Probably in the diff-review panel
component added in Wave 89 (artifact pane overlay) or its child diff
viewer.

## Scope

- Find the diff-review panel split container — likely under
  `src/renderer/components/Layout/**` or
  `src/renderer/components/AgentChat/**`. Suspect a `DiffReviewPanel`,
  `DiffReviewSplit`, or similar.
- Swap the flex ratios so code gets the dominant share.
- Add a draggable splitter (if not present) with a sensible min-width on
  the file list (~180px so filenames stay readable) and a min-width on
  the code side (~400px so diffs render usefully).
- Persist the user's chosen split ratio to per-window state via the
  existing layout persistence pattern.

## Why not Wave 94

Wave 94's scope was the five wave-89-pivot contract gaps + the Phase E
producer/consumer pipeline. The diff-review UI panel itself was Wave 89
territory. Layout polish on the consumer side belongs in a polish wave,
not the wave that wired the pipeline.

## Hooks for the implementer

- Grep `src/renderer/components/` for `diff-review` / `DiffReview` / the
  artifact pane components from Wave 89.
- The split is likely a CSS Grid or Flex with a fixed `width` /
  `flex-basis` on the file-list side. Inspect with React DevTools to find
  the offending container before grep.
- For the splitter, the codebase already uses an existing pattern in the
  workbench (dock slots, side panes) — reuse it rather than introducing
  a new dependency.

Estimate: 1–2 files, 1–2 hours including the persistence wiring.
