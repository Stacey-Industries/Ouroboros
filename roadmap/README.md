# Roadmap — taxonomy

This directory holds the project's wave-process artifacts, history indexes, and inbox queues. Layout follows the five-layer documentation framework at `~/.claude/notes/documentation-framework.md`. New session entry point: `HANDOFF.md` (Layer 1 orientation).

## Files

| Path | Layer | Purpose |
|---|---|---|
| `HANDOFF.md` | 1 | Evergreen orientation — next action / in-flight / blockers / critical context. Read first on session start. |
| `_index-history.md` | 3 | One-line entry per wave (active + recent). Discovery layer for shipped work. |
| `_archived/index.md` | 3 | One-line entry per archived wave (rotated when N+2 ships). |
| `_archived/wave-{N}-{slug}/` | 4 | Frozen wave folders. |
| `wave-{N}-{slug}/` | 4 | Active wave folders (current + last 2 shipped, before rotation). |
| `decisions/index.md` | 3 | Index of durable cross-wave ADRs. |
| `decisions/{topic}.md` | 4 | Per-decision ADR (Nygard template). Wave-scoped ADRs live inside each wave folder, not here. |
| `follow-ups/` | 5 | Inbox — mid-wave discoveries, deferred items. One file per item, `{date}-{slug}.md`. |
| `deferred/` | 5 | Explicitly scheduled work for future waves. |
| `bugs/` | 5 | Pre-existing bugs not yet in any active wave. |
| `discovery/` | 4 | Stage-1 Profile B feature briefs (in-project features). |
| `foundation/` | 2 | Durable foundational reference for major subsystems (chat orchestration, agent-chat best practices). |
| `cleanup/`, `oldfiles/`, `future/` | — | Project-specific holdovers from earlier organizational schemes. Not part of the canon taxonomy; folded in as needed. |

## Project-specific files

| Path | Purpose |
|---|---|
| `roadmap.md` | High-level long-arc product narrative (pre-dates this taxonomy; kept as-is). |
| `wave-temperature-log.md` | One-line-per-wave pain/temperature tag at wave-end. |
| `audit-handoff-2026-05-01.md`, `audit-verification-pass.md` | Frozen one-off audit reports. |
| `lead-dispatched.md`, `lead-final.md`, `triage-2026-05-05.md`, `triage-2026-05-07.md` | Frozen one-off triage / lead-orchestrator briefs. |

## Conventions

- **Wave folders never get deleted.** They rotate to `_archived/` when wave N+2 ships, never via `rm`.
- **One commit = one phase** during wave execution. Aggregate review + push happens at wave-end.
- **Wave-end checklist** (mandatory): append to `_index-history.md`; rotate N-2 to `_archived/` if not already; trim `HANDOFF.md`; update CHANGELOG if version bumped.

## Cross-references

- `~/.claude/notes/documentation-framework.md` — canon spec (read end-to-end before structural edits here)
- `~/.claude/notes/wave-process.md` — wave planning / execution / review process
- `~/.claude/rules/development-pipeline.md` — three-lane pipeline (Build / Fix / Orient)
- `../CLAUDE.md` — project-level commands, conventions, gotchas
- `../docs/` — Layer 2 reference (architecture, API contract, data model, etc.)
