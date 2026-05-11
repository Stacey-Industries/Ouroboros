---
status: OPEN
created: 2026-05-10
updated: 2026-05-10
---

# Diff Review artifact pane — top toolbar is cramped, controls misshapen

## Symptom

The Diff Review artifact pane's top toolbar tries to fit too many controls in one row at chat-only shell pane widths:

- "Diff Review" title
- "+1 -0" stat
- "0/1 Hunks Decided" counter
- "Undo last accept" button
- "Export" button
- "Accept All" button
- "Reject All" button

All seven elements are crammed into one row. Text wraps mid-word, buttons are visually misshapen (uneven sizing, inconsistent padding), and the row is hard to scan visually.

Surfaced during Wave 84 Phase 0 bug 2 repro (2026-05-10). Screenshot evidence: `~/Pictures/Screenshots/Screenshot 2026-05-10 205526.png`.

## Repro

1. Open the IDE in chat-only shell.
2. Ask the agent to edit any file.
3. Click "Full Review →" on the change summary bar.
4. Observe the top toolbar of the artifact pane — text wraps, buttons distort.

## Proposed shape (for the implementer to validate)

A few candidate directions; the implementer picks the right one after looking at usage patterns:

1. **Two rows** — title + stats on row one; action buttons on row two. Cheapest.
2. **Collapsible overflow** — primary actions (Accept All, Reject All) on the toolbar; secondary (Undo, Export) under a `⋯` overflow menu. Matches common pattern in IDE toolbars.
3. **Icon-only buttons with tooltips** — replace "Accept All" / "Reject All" / "Undo" / "Export" with icons and hover-tooltips. Compact but learnability cost.

Recommend (2) — keeps the primary affordances visible, hides the secondary actions until needed, matches conventional toolbar density rules.

## Suspect surface

- `src/renderer/components/AgentChat/AgentChatDiffReview.tsx` — the toolbar lives at the top of this component.
- May share fix with `2026-05-10-diff-review-two-column-layout-unworkable.md` (same artifact pane, same layout pass).

## Priority

Low-medium. Cosmetic / usability — the actions all work, they're just hard to read and hit. Group with the two-column-layout follow-up; one combined "diff review layout pass" wave or phase makes more sense than two separate fixes.

## Related

- `2026-05-10-diff-review-two-column-layout-unworkable.md` — adjacent layout issue in the same pane.
