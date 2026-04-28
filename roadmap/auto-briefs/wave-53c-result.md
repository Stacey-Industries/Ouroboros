# Wave 53c Result — Historical Corpus Analyzer & Decision Report

**Status:** ✅ COMPLETED — 2026-04-28
**Version:** v2.7.2 (patch — analyzer scripts + decision report; no production code path changes)
**Plan:** `roadmap/wave-53c-plan.md`
**Decision report:** `roadmap/wave-53c-corpus-analysis.md`
**ADR:** `roadmap/decisions/wave-53c.md`

---

## What shipped

The deferred Wave 53 Phase D, finally executed as its own wave. Three feature phases plus wrap-up:

1. **Phase A — Intent classifier.** `scripts/intent-classifier.ts` (221 lines) + `scripts/intent-classifier.test.ts` (331 lines, 48 fixtures). Pure-function classifier with 7 buckets (bug-fix / feature / refactor / review / meta-ux / continuation / other). Continuation runs first with a 40-char length gate; tie-breaking is bucket-order priority. Real corpus phrasing motivated three signal expansions (`issue`/`wrong`/`exception` for bug-fix; `simplify`/`restructure` for refactor; `confirm`/`verify` for review).

2. **Phase B — Corpus analyzer.** Three-file decomposition mirroring `analyze-ranker-hit-rate*.ts`:
   - `scripts/analyze-claude-corpus-types.ts` (200 lines) — types, `EDIT_MISMATCH_RE` constant, stat helpers, CSV serialization.
   - `scripts/analyze-claude-corpus-metrics.ts` (238 lines) — NDJSON parser, per-session accumulator.
   - `scripts/analyze-claude-corpus.ts` (244 lines) — CLI flags, file walking, aggregation, output.
   - `scripts/analyze-claude-corpus.test.ts` (383 lines, 31 fixtures).
   - `package.json` — `analyze:corpus` and `analyze:corpus:json` scripts.

3. **Phase C — Live corpus run + decision report.** `roadmap/wave-53c-corpus-analysis.md` (244 lines after late update). Analyzer ran in 3.4 seconds across 369 sessions (W13–W17 of 2026); 0 parse errors. Outputs at `roadmap/wave-53c-output/corpus-analysis.{json,csv}`.

Phase D (router backfill) was retired in this wave per ADR Decision 9. Phase E (this wrap-up) ran lint, typecheck, and pushed.

## Headline finding (the one that matters)

The corpus shows agents using `Grep + Glob + Read` 4,601 times across 369 sessions and the IDE's graph/symbol tools (`get_architecture`, `search_symbols`, `get_symbol`, `trace_imports`, `detect_changes`, `get_codebase_context`) **0 times.** Not "few." Not "underused." Zero.

This finding was uncovered after the initial threshold-driven verdict was written, in response to a user-driven challenge ("are agents not using graph tools by default?"). The verification was conclusive — and a quick root-cause diagnostic showed the gap is not behavior but wiring:

- **Tool-name drift.** `~/.claude/rules/graph-tool-routing.md` references `search_graph`, `trace_call_path`, `query_graph`, `get_code_snippet` — names the IDE does not actually expose. The rule documents tools the agent cannot call.
- **MCP server unreachable at audit time.** Port 57225 was dead; the project's `.claude/settings.json` had no `mcpServers` block. The internalMcp auto-inject (`src/main/internalMcp/internalMcpAutoInject.ts`) either de-registered itself or wasn't applied to the live workspace.

The corpus measured agent behavior against a tool surface the agent could not see. The result is a wiring failure that has been silently producing 0% adoption across every session in the recorded corpus.

## Verdict

**Wave 54 (TS semantic operations) — PAUSED, not greenlit.** The original threshold-driven verdict ("Conditional Go for read-only ops") is **superseded by ADR Decision 11**. Building Wave 54's `find_references` / `get_symbol_body` tools when the existing graph-tool layer has 0% adoption due to wiring failure would compound the problem.

**Wave 53d (graph tool adoption) — opens next.** Aligns rule names to reality, fixes auto-inject reliability, verifies external-terminal access via the existing stdio bridge, runs a live test, and decides if Wave 54 ships.

**Wave 53c Phase D (router backfill) — retired.** Live telemetry (restored in Wave 53) is the more durable signal than synthetic backfill on a 369-session sample where 60.7% of sessions are <60 seconds.

## Threshold check (preserved as historical context)

| Threshold | Result | Status |
|---|---|---|
| T1 — ≥10% of turns show grep-loop depth ≥3 | 15.2% of sessions (session-max, not per-turn) | Conditionally met |
| T2 — ≥15% of Edits fail on first attempt | 0.18% (4 / 2,239 attempts) | Decisively not met |
| T3 — ≥5% of refactor intent AND above-average failures | 5.7% prevalence ✓ but 0.00% failure rate ✗ | Not met |

The threshold logic was overshadowed by the adoption finding. The numbers are correct; their interpretation in isolation is not load-bearing for the decision.

## Phase tally

| Phase | Files | Lines | Tests | Commit |
|---|---|---|---|---|
| A — Intent classifier | 2 | 552 | 48/48 | `610bf5a` |
| B — Corpus analyzer | 5 | 1,067 | 31/31 | `6f6e30d` |
| C — Decision report | 3 (incl. analyzer outputs) | 913 | n/a | `c7e772c` |
| E — Wrap-up | This brief + plan/ADR finalization | — | — | (this commit) |

## Gates

| Gate | Result |
|---|---|
| `npm run lint` | ✅ 0 errors, 2 pre-existing warnings (FileViewer; carried from 53b) |
| `npx tsc --noEmit` (renderer) | ✅ clean |
| `npx tsc --noEmit -p tsconfig.node.json` (main) | ✅ clean |
| Phase A scoped tests | ✅ 48/48 |
| Phase B scoped tests | ✅ 31/31 |
| Full vitest suite | Skipped per user direction; pre-push hook will validate |

## Manual smoke

No UI surfaces touched — manual smoke gate from `~/.claude/rules/manual-smoke-gate.md` does not apply. The analyzer was smoke-tested on one real session JSONL during Phase B (verified output files well-formed, no anomalies).

## Subagent observations

Two Sonnet subagents — one per feature phase. Both ran cleanly without follow-up SendMessage rounds.

- Phase A subagent expanded bucket signals beyond the original brief based on real corpus phrasing samples; documented in commit body. Made two "tie-break" test fixture corrections mid-task that surface judgment about bucket ordering. Clean execution.
- Phase B subagent decomposed the analyzer into three files defensively to stay under the 300-line cap (mirrored the existing `analyze-ranker-hit-rate*.ts` pattern). Punted on `topPromptPatternsByBucket` (used dominant-tool-name as a proxy rather than parsing prompt text) — flagged in the report as an extension point if a future caller needs real prompt patterns. Clean execution.
- The ADR/verdict reframe in Decision 11 was orchestrator-level — both subagents had completed correctly when the user-driven challenge surfaced.

## Known limitations

- **n=369 sessions over 5 weeks.** Small. n=21 in the refactor bucket is too small for bucket-level confidence.
- **60.7% of sessions are <60 seconds.** Trivial / aborted / "hi" sessions. Substantive sessions are the other 145. The threshold checks are reported corpus-wide but the substantive sub-corpus would tell a different story.
- **Sample bias toward telemetry/UI work** in the recent corpus. Top files-touched are config schemas, telemetry plumbing, IPC, UI scaffolds. Pure-TS-refactor sessions where Wave 54 would shine are under-represented.
- **Edit-failure regex is narrow** (`/String to replace not found in file/i`). False-negatives possible if Anthropic varies phrasing.
- **Grep-loop depth is session-max, not per-turn.** Per-turn would tighten T1; out-of-wave follow-up.
- **`topPromptPatternsByBucket`** uses dominant-tool-name as a proxy. Phase C didn't need real prompt patterns to deliver the verdict; future analyses can extend.

## Out-of-wave follow-ups

- **Wave 53d — graph tool adoption fix** (next wave). Five phases sketched in the conversation: tool-name audit → auto-inject reliability fix → external-terminal verification → live test → decision report.
- **Wave 54 plan stays in `roadmap/wave-54-plan.md`** with status BLOCKED. Blocker now reads: "Wave 53d's adoption-rate measurement after the wiring is fixed."
- **Quarterly re-run** of `npm run analyze:corpus` against accumulated corpus. Reusable.
- **Per-turn grep-loop measurement** — additive change to `analyze-claude-corpus-metrics.ts`.
- **Standalone MCP server extraction** ("Flavor B" — terminal works with IDE off). Wave-sized refactor; deferred unless 53d's outcome creates demand.
- **Live-telemetry router calibration** once ~1K live-telemetry turns accumulate post-Wave-53; replaces the retired synthetic Phase D.

## Version drift note

The git tag history runs through v2.7.1 (Wave 58). Wave 59's result brief claims v2.8.0 and Wave 53b's claims v2.10.0, but no release commits or tags exist for those. This wave bumps from v2.7.1 → **v2.7.2** as a patch (docs + scripts only, no production code path changes), aligning to actual git tag state rather than the aspirational version numbers in earlier briefs.

The version-drift discrepancy between result briefs and the git tag history is not addressed in this wave. If left unaddressed, future waves continuing to use aspirational versions in briefs without matching tags will compound the drift. Suggested cleanup: a small reconciliation pass that picks one truth (either retroactively tag 59 and 53b, or rewrite their briefs to match git tags) and aligns going forward.

## Memory update

A pointer added to `~/.claude/projects/C--Web-App-Agent-IDE/memory/MEMORY.md` capturing:
- Wave 54 paused on adoption gap (not corpus thresholds).
- 0% graph-tool adoption finding (wiring failure, not behavior).
- Wave 53d opened to fix.
- The reusable analyzer scripts under `scripts/`.