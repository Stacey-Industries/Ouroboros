---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 Phase E end-to-end smoke (post-bugs A-E fix)
---

# Diff-review panel — cross-project attribution missing

Surfaced during Wave 94 Phase E smoke (Cole, 2026-05-18), specifically
the multi-claude / cross-project scenario that Bug E's pathSecurity
bypass enabled.

## Symptom

> "There is no way to tell which project's file was edited. I have 3
> terminals running outside of the IDE, and all their diffs populate in
> the IDE diff, but no collapsible row that ties diffs to a specific
> project."

When multiple terminal-launched Claude sessions edit files across
different projects (e.g., one in Agent IDE, one in Gamify, one in
Contractor App), all the edited files dump into a single flat list in
the diff-review panel with no visual grouping or attribution. Users
can't tell which files belong to which project — the cwd information IS
captured by the snapshot (Bug A fix verified this) but the consumer UI
discards it.

## Scope

1. **Group files by project root in the diff-review file list.**
   - Collapsible sections per project: `▼ Agent IDE (3 files)` /
     `▼ Gamify (2 files)` / `▼ Contractor App (1 file)`.
   - Project label sourced from the snapshot's recorded `cwd`. Derive
     project name from the cwd's last path segment, or look up against
     known workspace projects + fall back to "Other".
   - Default: all sections expanded. Persist user's collapsed/expanded
     state per session.

2. **Project badge per file row** as redundant signal — small colored
   tag next to each filename. Helps when sections are collapsed and only
   a subset is visible.

3. **Empty-project sections collapse to a one-line summary.** When all
   files in a project section are accepted/rejected, that section
   collapses with a "All 3 reviewed" hint.

## Why not Wave 94

Wave 94 Phase E shipped the producer pipeline (terminal-launched claude
→ diff review fires). The producer correctly passes the cwd through.
Adding cross-project UI grouping is a NET-NEW consumer feature — Phase E
never specified it and the original use case was single-project. Cole's
real workflow of multi-project simultaneous Claude sessions surfaced the
gap during smoke.

## Hooks for the implementer

- The snapshot's `cwd` field is already populated correctly (Bug A fix
  in `assets/hooks/pre_tool_use.mjs` adds `cwd: process.cwd()`).
  Producer wiring is done.
- Consumer side: the `diff_review_ready` event payload includes
  `projectRoot` (see `[trace:diffreview-prod] emitting diff_review_ready`
  shape in the Wave 94 traces). The diff-review panel currently ignores
  this for layout purposes — it just appends to a flat list.
- The grouping logic lives in the diff-review panel component (same one
  flagged in `2026-05-18-diff-review-panel-layout-inverted.md`).
  Probably under `src/renderer/components/Layout/**` or
  `src/renderer/components/AgentChat/**`.
- Existing collapsible-section primitives exist elsewhere in the UI
  (FileTree, agent monitor panels) — reuse the pattern.

## Why this matters

The terminal-first chat workbench (Wave 89 pivot) actively encourages
multi-project workflows — Cole's typical session has terminals across
Agent IDE, Gamify, and Contractor App simultaneously. The diff-review
feature is unusable in that workflow without project attribution. This
is not polish — it's a usability blocker for the dominant use case.

Estimate: 1 wave-phase, ~3–5 files, ~4–6 hours including the badge
component, section collapse/expand state, and persistence.
