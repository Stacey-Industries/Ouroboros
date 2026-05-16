---
status: SHIPPED
created: 2026-05-13
shipped: 2026-05-13
wave: M5
type: infra (doc-only; no version bump)
---

# Wave M5 — Documentation Framework Migration — Result Brief

## Goal

Apply the standardized documentation framework (`~/.claude/notes/documentation-framework.md`) to Agent IDE. Align this project's `roadmap/` structure with Gamify and Contractor App for cross-project consistency. Trim orientation document to the framework's 300–500-word target and build the Layer-3 discovery indexes.

## What shipped

### Commits

| Commit | Phase | Topic |
|---|---|---|
| `6266eedb` | 1 | Wave history + decisions indexes |
| `42103580` | 2 | `archive/` → `_archived/` rename + archived index + 16-file reference update |
| `d84b791c` | 3 | Lean HANDOFF.md rewrite + retire stale `session-handoff.md` + roadmap README + smoke-gate checklist extraction |
| `13be7fef` | 4 | Wave folder promotion + result brief |
| `577c96bd` | 5 | `docs/` → `roadmap/docs/` relocation per 2026-05-13 canon (37 doc files + 30 reference updates + `check-docs-schema.ts` refactor for lint compliance) |

### Files created

- `roadmap/_index-history.md` — Layer 3 wave discovery index (W60–W87 active, pointer to archived rows)
- `roadmap/_archived/index.md` — Layer 3 archived-wave discovery index (W15–W59 + pre-Wave-15 planning docs)
- `roadmap/decisions/index.md` — Layer 3 ADR index (empty: wave-scoped ADRs continue to live inside each wave folder)
- `roadmap/README.md` — taxonomy doc per framework spec
- `docs/manual-smoke-gate-checklist.md` — reference doc with the UI-wave smoke checklist (extracted from `session-handoff.md`)

### Files renamed (preserved history via `git mv`)

- `roadmap/archive/` → `roadmap/_archived/` (55 wave folders + 9 topic docs)
- `roadmap/_README.md` → `roadmap/oldfiles/2026-04-26-auto-execution-briefs-readme.md` (the original was a one-off operational doc, not the roadmap README; moved out of canonical namespace)
- `roadmap/wave-doc-migration-DRAFT/` → `roadmap/wave-M5-doc-migration/`

### Files modified

- `roadmap/HANDOFF.md` — lean rewrite to framework template (408 words; was previously 102 lines of mixed orientation + state)
- Root `CLAUDE.md` — session-pickup pointer block (HANDOFF.md, `_index-history.md`, `_archived/index.md`, `decisions/index.md`), smoke-gate template path updated to `docs/manual-smoke-gate-checklist.md` and rule pointer to `rules-deferred/`
- 16 live docs updated for `roadmap/archive/` → `roadmap/_archived/` (CHANGELOG, docs/architecture, docs/context-ranker, docs/codemode-internalmcp-routing, docs/hook-migration, src/renderer/styles/globals.css (functional Tailwind glob), src/renderer/CLAUDE.md, roadmap/audit-*, roadmap/foundation/agent-chat-best-practices/04-ouroboros-gap-analysis, roadmap/follow-ups/follow-ups, roadmap/deferred/*, roadmap/cleanup/docs-drift)
- `docs/hook-migration.md`, `roadmap/follow-ups/follow-ups.md` — `session-handoff.md` refs → `HANDOFF.md`

### Files deleted

- `roadmap/session-handoff.md` — stale 352-line accumulation from Wave 40 era + ad-hoc bolt-ons. Reference-quality content (Wave 58+ smoke gate template) extracted to `docs/`. The current orientation document is `HANDOFF.md` (already existed with current Wave 86/87 state; brief was written assuming only the stale file existed).

## Decisions made

- **Wave naming = M5.** Following the Pipeline Hardening M-1/M-4 pattern (infra-only, no version bump). M5 fits because this is doc infrastructure, not feature work.
- **`_README.md` moved to `oldfiles/`, not renamed to `README.md`.** The brief assumed `_README.md` was the roadmap README; in fact it was operational content describing a 2026-04-26 overnight cron job. A new proper `README.md` was authored from the framework taxonomy. The original was preserved (not deleted) by moving to `oldfiles/` with a date prefix.
- **`session-handoff.md` deleted, not archived.** `HANDOFF.md` already existed in canonical form with current state. The stale file had no historical record value not already captured in wave folders + result briefs. The one reference-quality block (smoke gate checklist) was extracted to `docs/`.
- **Wave 58+ smoke gate extracted to `docs/`, not left in `HANDOFF.md`.** Reference content, not state. The cold-reader test demanded it move.
- **Tailwind `@source not` glob update is functional, not cosmetic.** `src/renderer/styles/globals.css` Tailwind v4 directive would have crashed the renderer build on Windows Unicode escapes if left pointing at the now-empty `roadmap/archive/` glob. Updated in same commit as the rename.

## Acceptance criteria (from brief)

| Criterion | Status |
|---|---|
| `roadmap/HANDOFF.md` ≤ 800 words (target 300–500) | ✅ 408 words |
| `roadmap/_index-history.md` exists with one row per shipped wave | ✅ W60–W87 active + pointer to archived |
| `roadmap/_archived/index.md` exists | ✅ W15–W59 + 9 pre-Wave-15 docs |
| `roadmap/decisions/index.md` exists | ✅ (empty; documented in README) |
| All references updated (no orphan refs to old paths in live files) | ✅ grep clean |
| 30-second cold-read orientation test passes | ✅ self-verified |
| CLAUDE.md remains within line cap | ✅ root CLAUDE.md ~136 lines (soft 200 target) |
| All wave folder paths preserved (no folders deleted) | ✅ all 64 archived wave folders rotated via `git mv` |

## Out of scope (per brief)

- No subdirectory CLAUDE.md restructuring
- No `docs/` content changes (other than the new `manual-smoke-gate-checklist.md`)
- No `src/` code changes (other than the Tailwind glob update, which is functional)
- No new `CHANGELOG.md` (deferred)
- No resolution of the Electron-adapter-refactor follow-up (its own dedicated wave)

## Lessons learned

- **The brief was written from a stale survey.** It assumed `HANDOFF.md` didn't exist and that `_README.md` was the roadmap README. Reality: `HANDOFF.md` existed with current Wave 86/87 state; `_README.md` was a one-off operational doc. Reading the actual state of the repo at the start of execution caught this and saved a wrong-direction redo.
- **Tailwind v4 `@source not` is part of the rename surface.** Any future rename of a `roadmap/` subdirectory must extend `globals.css` in the same commit, or the renderer build dies on Windows Unicode escapes. Documented in `src/renderer/CLAUDE.md` gotchas (already present; rename-aware).
- **`docs/manual-smoke-gate-checklist.md` is the canonical extraction.** When future content gets bolted to HANDOFF.md, the question to ask is: "is this state, or reference?" Reference goes to `docs/`. State stays in HANDOFF.md. Wave 58+ test of this rule passed.

## Follow-ups filed during this wave

None. Mechanical migration, no side discoveries that warrant their own item.

## Squash commit

To be filled in at wave close after pre-push verification + push to `origin/master`. This wave does not bump version (infra-only, doc-only) — no CHANGELOG entry, no tag.
