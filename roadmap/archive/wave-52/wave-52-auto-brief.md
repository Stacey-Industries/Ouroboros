# Wave 52 Result — Telemetry Parity: Audit + Queue Infrastructure + First Migration

**Status:** ✅ COMPLETED — 2026-04-27
**Version:** v2.9.1 (patch)
**Plan:** `roadmap/wave-52-plan.md`

---

## What shipped

The foundation for **symmetric telemetry capture** between IDE-spawned (internal) and terminal-CLI (external) Claude Code sessions. Today, every IDE-only emit site silently drops data when the IDE main process isn't running — biasing the corpus that Auto Effort, Auto Model, the context ranker, and research/retrain depend on. Wave 52 ships the pipe; Wave 53a migrates the rest of the surfaces; Wave 53b runs the original ranker measurement on the now-unifiable corpus.

Concrete deliverables:

1. **Telemetry surface audit** (`roadmap/wave-52-audit.md`). 16 emit surfaces inventoried across `src/main/`, classified as `global-hookable` (6 — fix once), `buffer-via-hook` (5 — new hook scripts needed), or `fundamentally-IDE-only` (5 — accepted gaps with rationale). Audit names the highest-leverage migration: a single ~80-LOC JSONL fallback inside `assets/hooks/lib/ouroboros.mjs` flips 6 surfaces to parity in one stroke (Wave 53a's first item).

2. **Queue + drain pipe primitives** (Phase B):
   - `src/main/telemetry/telemetryQueue.ts` — `appendToQueue(surface, schemaVersion, payload)` with UUID record IDs, schema versioning, and per-file size-cap rollover.
   - `src/main/telemetry/telemetryDrain.ts` — `drainQueue()` runs at IDE startup, atomically moves queue files to processed/, dispatches each record to a registered handler, deletes processed/<file> on full success, retains on partial failure for human review. Idempotent across restarts; forward-compatible (unknown surfaces or schemaVersions logged + skipped, never crashes).
   - `src/main/telemetry/queueRotation.ts` — total dir cap (100MB), oldest-N drop on overflow.
   - `src/main/telemetry/telemetryDrainStartup.ts` — boot wrapper, gated behind `telemetry.parityQueue.enabled` flag (default true), error-contained.
   - `assets/hooks/lib/telemetryQueueAppend.mjs` — pure-Node hook-side helper. Zero IDE deps, identical record shape to the IDE-side `appendToQueue`.

3. **First migration: spawn-cost via queue** (Phase C). Proves the pipe end-to-end:
   - `assets/hooks/session_start_spawn_cost.mjs` — SessionStart hook reads spawn metadata + `.claude/settings.json`, builds a record matching Wave 51's `mcpSpawnCostTelemetry` shape, appends to the queue. Never throws.
   - `src/main/orchestration/providers/spawnCostDrainHandler.ts` — drain handler validates `schemaVersion === 1`, dedupes against the existing JSONL by `Set<sessionId>` built once at boot, forwards to the existing `emitMcpSpawnCost` write path. Single-source-of-truth file write; hook records and IDE records funnel into the same JSONL with `ide_session: false` distinguishing them downstream.
   - Registered in `main.ts` boot before `runParityQueueDrain`.

4. **Operator-facing documentation** (Phase D). `docs/telemetry-parity.md` covers architecture, hook contract, queue lifecycle, drain semantics, and a step-by-step recipe for adding a new surface (Wave 53a will follow this recipe). Manual hook-installation snippet for `~/.claude/settings.json` provided. Wave 53a/53b stub plans on disk with clear scope.

## Plan deviation

The wave was **reframed mid-discussion** from the original ranker measurement scope. Verification found that the historical session corpus the ranker analysis would consume is biased toward IDE-orchestrated sessions (~40% of the JSONL files). Running the analysis on a biased corpus would produce conclusions that don't generalize to the user's actual workflow. Right sequence: fix the corpus first, then measure. Original ranker work moved to Wave 53b.

User direction shaped two key calls:
- **Defer-and-batch over live ranker CLI** for the "external sessions need the same data" requirement. Same architecture works for every telemetry surface uniformly, lower risk, no standalone ranker extraction needed. Wave 52 builds the universal pipe.
- **Phase C ships regardless** carries forward to Wave 53b — variant ranker behind `contextRanker.mode` flag will land even if Phase A's analysis says "no change needed." User wants concrete artifacts every wave, no deferral.

## Phase commits (master)

- `2104238` — docs(wave-52): Phase A — telemetry surface audit
- `8eb475d` — feat(wave-52): Phase B — queue + drain primitives
- `a66707e` — feat(wave-52): Phase C — first migration: spawn-cost via queue
- `fea7d85` — docs(wave-52): Phase D — close + telemetry-parity doc

## Files touched (count)

- 13 new files (audit doc, 4 telemetry primitives + 4 tests, hook script, drain handler + test, lifecycle doc, telemetry CLAUDE.md, two stub plans for Wave 53a/53b)
- 5 modified (main.ts, mcpSpawnCostTelemetry.ts, configSchemaTail/Ext, configAppTypes, root CLAUDE.md, session-handoff)

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` (timeout 800) | ✅ 883 files / 9305 passed / 8 skipped / 0 failures |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (2 pre-existing FileViewer warnings unrelated) |
| `npm run lint:claude-md` | ✅ all CLAUDE.mds within 200-line cap |
| Phase B scoped tests | ✅ 39/39 (queue + drain + rotation + startup) |
| Phase C scoped tests | ✅ 15/15 (spawn-cost drain handler + dedup) |

## Manual smoke (deferred to user — requires manual hook install)

The wave's runtime-smoke step requires the user to add the SessionStart hook to `~/.claude/settings.json`. Documented in `docs/telemetry-parity.md` and `roadmap/session-handoff.md`. After install + an external Claude Code session + IDE restart, a record with `ide_session: false` should appear in `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl`. No UI surfaces touched, so the wave-process manual smoke gate doesn't apply.

## Subagent observations

- Phase A (audit) — `general-purpose`, completed clean first try.
- Phase B (queue infrastructure) — `general-purpose`, completed clean first try. Extracted `telemetryDrainStartup.ts` to keep `main.ts` under cap (defensive splitting, defensible).
- Phase C (first migration) — `general-purpose` with `model: "sonnet"`. Stopped mid-edit on `main.ts` wiring; resumed via `SendMessage` cleanly.
- Phase D (docs) — `general-purpose` with `model: "sonnet"`, completed clean first try. Properly absorbed previously-untracked plan revisions into the commit.

**Important model-selection note:** Phases A and B ran on Opus by default because the parent session is Opus and I omitted `model:` on the Agent dispatches. The user's global rule (`~/.claude/rules/agent-model-selection.md`) requires `model: "sonnet"` on every dispatch. From Phase C onward, every Agent call set `model: "sonnet"` explicitly. The Phase A and B work was correct but cost more than it should have; flagged and corrected.

## Known limitations

- **Hook installation is manual.** User must add the SessionStart entry to `~/.claude/settings.json`. Auto-install is a Wave 53a+ follow-up.
- **Spawn-cost is the only migrated surface.** Wave 53a migrates the remaining 10 surfaces from the audit.
- **`fundamentally-IDE-only` surfaces** (per the audit): PTY-exit outcomes, stdin/stdout traces, preToolResearch / factClaim / researchSubagent traces, session lifecycle, context decisions/outcomes, research outcomes / corrections, startup timings, chat regen/correction half. These cannot be hook-captured because they require inspection only the IDE main process can do (e.g., watching the spawned Claude Code subprocess's stdout for token counts). Documented gap.
- **`main.ts` is at 337 lines** (over the 300-line file cap). Pre-existing condition (335 before this wave); Phase C added 2 lines for the handler registration. Grandfathered by the project's `eslint-disable` for this file. Worth a focused split in a future wave.

## Out-of-wave follow-ups

- **Wave 53a** — migrate every remaining surface from the audit through the queue+drain pipe. Recipe documented in `docs/telemetry-parity.md`. Highest-leverage first item: `assets/hooks/lib/ouroboros.mjs` JSONL fallback (one ~80-LOC change brings 6 surfaces to parity).
- **Wave 53b** — original ranker measurement (offline analysis + online telemetry + variant ranker) on the now-unified corpus.
- **Hook auto-install** — automate the `~/.claude/settings.json` registration. Pairs with Wave 56 (Teams Mode) or earlier UI wave.
- **SQLite mirror of all queued records** — currently spawn-cost goes to its existing JSONL sink; eventually all surfaces should mirror into the SQLite store for unified querying.
- **Drain throttling** — if the queue is large, drain in batches to avoid blocking startup.
- **`main.ts` split** — drop the grandfathered file-level lint disable.
