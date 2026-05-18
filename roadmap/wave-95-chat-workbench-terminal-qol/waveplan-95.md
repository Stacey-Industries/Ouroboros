---
status: PLANNED
created: 2026-05-18
updated: 2026-05-18
wave: 95
slug: chat-workbench-terminal-qol
tag: v2.19.1
---

# Wave 95 — Chat-Workbench Terminal Quality-of-Life (fix sweep)

## Status

PLANNED — fix-sweep wave bundling 5 follow-ups surfaced by Wave 94's
wave-wrap smoke walk (2026-05-18). Target `v2.19.1` (patch — no
new contracts, all polish + bug fixes). Skeleton authored by Wave 94
orchestrator at wave-wrap; next session executes.

## Context

Wave 94 (Chat-Workbench Completion) shipped the five wave-89-pivot
contract gaps. The wave-wrap smoke walk surfaced 5 additional items —
4 pre-existing limitations the terminal-first pivot makes visible, plus
1 net-new UX request. All are small enough to bundle into a single
fix-sweep wave rather than chase individually.

## Goal

After Wave 95, the chat-workbench terminal experience is polished:

- Terminal tabs can be renamed (per-tab affordance), and user renames
  survive PTY title-change events.
- Long Claude TUI sessions don't lose history — terminal scrollback
  buffer expanded to a sane modern default + setting exposed.
- No more ghost cursor when running interactive TUIs in the terminal.
- Claude Code's TUI renders correctly (colors / box borders / cursor)
  in the in-app terminal.
- Secondary dock slot's collapsed-empty chrome is intentional (either
  matches Cole's mental model after clarification, or restructured per
  Option B/C in the follow-up).
- Diff-review panel layout is usable: code dominates (not file list),
  draggable splitter, sensible defaults.
- Diff-review panel groups changed files by project (collapsible
  sections with badges) so multi-project Claude workflows are reviewable.
- Diff-review "wrong edit shown" investigation diagnosed and resolved
  (Lane B) — users trust the surface for production review workflows.

## Bundled follow-ups (1 phase each)

| Phase | Topic | Source follow-up |
|-------|-------|-----------------|
| A | Terminal tab rename | `roadmap/follow-ups/2026-05-18-terminal-tab-rename.md` |
| B | Terminal scrollback buffer bump + setting | `roadmap/follow-ups/2026-05-18-terminal-scrollback-truncated.md` |
| C | Ghost-cursor fix (xterm WebGL/DOM overlap audit) | `roadmap/follow-ups/2026-05-18-terminal-ghost-cursor-resurfaced.md` |
| D | Claude CLI color rendering in terminal | `roadmap/follow-ups/2026-05-18-claude-cli-color-rendering-in-terminal.md` |
| E | Secondary slot collapsed-chrome clarification | `roadmap/follow-ups/2026-05-18-secondary-slot-collapsed-chrome.md` |
| F | Diff-review panel layout (80/20 inverted) | `roadmap/follow-ups/2026-05-18-diff-review-panel-layout-inverted.md` |
| G | Diff-review cross-project grouping + attribution | `roadmap/follow-ups/2026-05-18-diff-review-cross-project-grouping.md` |
| H | Diff-review wrong-edit-shown investigation (Lane B) | `roadmap/follow-ups/2026-05-18-diff-review-wrong-edit-shown.md` |
| I | Wave wrap | scoped + full gates, `/review`, `wave-95-result.md`, CHANGELOG [2.19.1], smoke re-run on terminal-only checklist, tag, push |

## Phase ordering

Phases A–E (terminal QoL) are independent — no cross-file dependencies
between them. Can parallelize freely.

Phases F–H (diff-review UX) added 2026-05-18 after Wave 94's Phase E
producer/consumer pipeline shipped end-to-end. F (layout) and G
(grouping) likely touch the same diff-review panel component — sequence
F → G to avoid merge churn. H (wrong-edit diagnosis) is Lane B work
that should land before F/G so any contract-level issues surface before
layout polish.

Phase E (secondary slot chrome) is the lowest-priority — it might
collapse to "no change needed, just clarification" depending on the
investigation outcome. If E resolves to "no change," drop it from the
wave and ship A–D + F–H.

## Scope (in)

- Each phase's named follow-up document, no scope creep beyond it.
- Tests for new behavior (tab rename persistence, scrollback config).
- CLAUDE.md updates where applicable (Terminal/ subsystem for B/C/D;
  ChatOnlyShell/ for A/E).

## Scope (out)

- New chat-workbench surfaces (Wave 90 / 91 still pending separately).
- Terminal subsystem rewrites — patch within existing primitives.
- Cross-window IDE-tool delegation (separate follow-up, untouched).

## ADR placeholder

No locked decisions yet. Phase A may need a small one on
"PTY title-change vs user rename precedence" — Phase 0 ADR if it gets
non-trivial. Phase C may need one on "WebGL vs Canvas renderer choice"
if WebGL turns out to be unfixable for the cursor issue.

## Validation

- Per-phase scoped tests (`test:layout`, `test:terminal`, etc.).
- Manual smoke at wave wrap: terminal-only checklist (rename, scrollback,
  ghost cursor, claude TUI colors, secondary slot chrome).
- No full app-shell re-smoke needed — Wave 94 covered that surface.

## Risks

- **Phase D (Claude CLI colors)** — root cause may be in xterm.js theme
  application, OSC handler policy, or terminfo. If it requires bumping
  xterm.js version or changing OSC handler rules, scope grows.
- **Phase C (ghost cursor)** — if the WebGL fix is non-trivial or
  requires falling back to Canvas, scope grows. Worth an
  investigate-first phase (`sonnet-diagnostician`) before committing
  to a fix shape.
- Wave 95 is patch-level; if any phase's investigation reveals it's
  actually a minor feature (e.g., scrollback setting becomes a new
  config surface), bump to v2.20.0 and reclassify the wave.

## Handoff

Next session: read this file + the 5 follow-up docs in
`roadmap/follow-ups/`. Use `/wave-plan` or `/wave-plan-lite` if the
phases need deeper specification before dispatch. Phase B is the
quickest win and a good warm-up — single config addition + one xterm
init line.
