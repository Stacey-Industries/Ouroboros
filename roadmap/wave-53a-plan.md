# Wave 53a — Telemetry Parity: Migrate Remaining Surfaces

## Implementation Plan (DRAFT — STUB)

**Status:** DRAFT — full plan written after Wave 52 Phase A's audit lands. This stub captures intent and known shape.
**Version target:** v2.9.2 (patch) or v2.10.0 (minor) depending on scope of migrations
**Feature flags:** none new — surfaces use Wave 52's `telemetry.parityQueue.enabled` flag inherited from infrastructure
**Dependencies:** Wave 52 ✅ (audit + queue+drain primitives + first migration)

---

## Overview

Wave 52 shipped the audit (`roadmap/wave-52-audit.md`) and the queue+drain pipe (proved end-to-end with the spawn-cost migration). Wave 53a migrates every remaining surface from the audit through the same pipe. Each migration follows the recipe in `docs/telemetry-parity.md`.

---

## Scope

### In-scope

- For each `global-hookable` and `buffer-via-hook` surface in the audit:
  - Write a hook script that captures the data and appends to the queue.
  - Write the matching drain handler.
  - Register both.
  - Test the migration.
- Update `docs/telemetry-parity.md` with completed surfaces.
- Document any surfaces classified as `fundamentally-IDE-only` and the accepted gap.

### Out-of-scope

- Adding new emit sites that don't exist today.
- Schema changes to the SQLite store.
- Ranker measurement (Wave 53b).

---

## Phases (preliminary; finalized after audit)

Based on the categories the audit is expected to surface:

| Phase | Surface category | Likely effort |
|---|---|---|
| A | Tool use fallback (PreToolUse / PostToolUse to JSONL when IDE pipe unreachable) | Small |
| B | Outcomes (SessionEnd hook → exit code + duration → outcomes table) | Small |
| C | Spawn-time data beyond MCP cost (model, effort, cwd, goal) | Medium |
| D | Quality signals (UserPromptSubmit timing, follow-up patterns) | Medium |
| E | Stream traces (per-tool capture; accept reduction for assistant prose) | Medium-Large |
| F | Close + docs |

Audit may consolidate or split these.

---

## Acceptance criteria (preliminary)

- [ ] Every audit row classified `global-hookable` or `buffer-via-hook` is migrated.
- [ ] `fundamentally-IDE-only` rows are documented as known gaps with rationale.
- [ ] `docs/telemetry-parity.md` reflects every shipped migration.
- [ ] Full suite green; manual smoke confirms external sessions emit records for every migrated surface.
- [ ] Wave 53b unblocked: corpus is now unified across internal and external sessions.

---

## Notes for Wave 53a planning

When this stub becomes a full plan after Wave 52 Phase A lands:

- Group migrations by hook event (Phase A might be "everything that fires on PreToolUse"; Phase B "everything on SessionEnd"; etc.) rather than by data domain. Reduces the number of new hook scripts.
- The audit will reveal whether some surfaces share enough structure to consolidate into a single hook.
- Estimate based on audit's effort numbers; may split into Wave 53a / 53a-2 if the migration backlog is large.
