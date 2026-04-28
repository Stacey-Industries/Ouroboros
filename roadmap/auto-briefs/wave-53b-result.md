# Wave 53b Result — Context Ranker Measurement & Variant

**Status:** ✅ COMPLETED — 2026-04-27
**Version:** v2.10.0 (minor — new agent capability surface; variant ranker + ranker telemetry)
**Plan:** `roadmap/wave-53b-plan.md`

---

## What shipped

The original Wave 52 ranker measurement, deferred until Wave 53a's parity infrastructure landed. Four phases:

1. **Phase A — Offline analyzer + decision report.** `scripts/analyze-ranker-hit-rate.ts` walks the Claude Code session JSONL corpus, extracts `<relevant_code>` file lists from turn 0, correlates with subsequent Read tool-uses, computes per-session hit rate / recall@k / any-hit rate / per-bucket breakdown via `goalClassifier`. Real numbers from the corpus run captured in `roadmap/wave-53b-analysis.md` and `roadmap/wave-53b-data.json`.

2. **Phase B — Online telemetry.** `contextRankerTelemetry.ts` emits a selection record at `contextPacketBuilder.ts:300` post-rerank (the final ranking the agent sees), tracks Reads via `hooksRankerReadTap.ts`, and flushes a per-session hit summary at session-end to `~/.ouroboros/telemetry/ranker-hits.jsonl`. Two record kinds (`ranker.selection.v1` + `ranker.hit.v1`) in one file. Gated by `contextRanker.telemetryEnabled` (default true).

3. **Phase C — Variant ranker.** `contextSelectorRankerVariant.ts` ships sparse weight overrides for `tuned` and `experimental` modes behind `contextRanker.mode` (default `current`). Tuned shifts weight from `keyword_match` (26 → 16) toward file-state signals (`git_diff` 56 → 70, `dirty_buffer` 68 → 78, `recent_edit`/`recent_user_edit` 32 → 42). Experimental more aggressive (also adds `diagnostic` 52 → 70, drops `keyword_match` to 12). Variant defaults OFF — user opts in.

4. **Phase D — Documentation + ADR finalization.** `docs/context-ranker.md` (324 lines) covers ranker mechanics, modes, telemetry, hit-rate metrics + their limits, re-run cadence, and graduation path to Bayesian / LTR. ADR finalized at `roadmap/decisions/wave-53b.md` with end-of-wave Decisions 7-9.

## Phase A's headline numbers — and the metric ambiguity

The offline analysis reported:
- 24 sessions analyzed (after filtering noise; small sample, corpus bias caveat documented)
- **6.3% mean re-fetch rate** (decision per threshold: REDESIGN)
- **45.8% any-hit rate** (in 45.8% of sessions, at least one pre-loaded file was Read)
- Per-bucket: code n=18 mean 7.8% / casual n=5 mean 2.0% / unknown n=1 mean 0.0%

**Important nuance discovered mid-wave:** `<relevant_code>` includes snippet *content*, not just metadata. So a file already-in-context doesn't need to be Re-read for its content to be useful. Re-fetch rate measures something narrower than "was this file useful?" — it measures "did snippets fail to satisfy?" The any-hit rate (45.8%) and recall@k are arguably the more meaningful baselines.

This nuance is documented prominently in `docs/context-ranker.md` and in ADR Decision 8. The variant ships per user standing direction; Phase D's framing is "exploratory variant + measurement infrastructure" rather than "validated improvement."

## Architectural decisions ledger

Captured in `roadmap/decisions/wave-53b.md`:

- **D1:** Run analysis on biased corpus + schedule re-runs (option C — emerging best practice)
- **D2:** Hand-tuned variant, not Bayesian / LTR (industry standard; corpus too small for the alternatives)
- **D3:** Recall@k + simple any-hit metric (industry standard; NDCG requires graded relevance we lack)
- **D4:** Phase B telemetry observes post-rerank output (the agent's actual baseline)
- **D5:** Variant defaults off (per user standing direction)
- **D6:** Per-surface schema discipline (carry-forward from Wave 53a)
- **D7:** Variant weight choices + per-reason rationale tied to Phase A bucket numbers
- **D8:** Metric ambiguity discovered mid-wave (snippet content makes re-fetch rate narrow; any-hit + recall@k are more reliable)
- **D9:** Telemetry record shape descriptive, not metric-baked — future analyses can apply different metrics over the same data

## ADR convention introduced this session

Pre-Wave-53b, decisions lived in commit messages + result briefs. This session introduced the ADR convention as a global rule (`~/.claude/rules/best-practice-spectrum.md`) and a per-wave file at `roadmap/decisions/wave-NN.md`. ADRs backfilled retrospectively from result briefs for waves 49 / 50 / 51 / 52 / 53a in the same prep commit (`b6c7588`). Going forward, every wave creates its ADR during plan revision, updates during implementation, and finalizes at wave close.

## Phase commits (master)

- `b6c7588` — docs(wave-53b): introduce ADR convention + backfill 49-53a + revise 53b stub
- `942042b` — docs(wave-53b): Phase A — offline ranker hit-rate analysis
- `fa7d75d` — feat(wave-53b): Phase B — ranker hit-rate telemetry
- `f7c5898` — feat(wave-53b): Phase C — variant ranker behind contextRanker.mode flag
- `9e41f13` — docs(wave-53b): Phase D — context-ranker doc + finalize ADR

## Files touched (count)

- 14 new files (analyzer + helpers + tests, telemetry module + schema + tests, Read-tap + tests, tier-builder helper + tests, variant ranker + tests, analysis report, lifecycle doc)
- 9 modified (configSchemaTailExt, configAppTypes, contextPacketBuilder, contextPacketBuilderHelpers, contextSelectorWorkflow, hooks, hooksSessionHandlers, orchestration CLAUDE.md, root CLAUDE.md, session-handoff)
- 7 ADR files (5 backfills + new wave-53b + the rule update)

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` (timeout 800) | ✅ 897 files / 9480 passed / 8 skipped / 0 failures |
| `npx tsc --noEmit` (renderer) | ✅ clean |
| `npx tsc --noEmit -p tsconfig.node.json` (main) | ✅ clean |
| `npm run lint` | ✅ 0 errors (2 pre-existing FileViewer warnings unrelated) |
| `npm run lint:claude-md` | ✅ all CLAUDE.mds within 200-line cap |
| Phase A scoped tests | ✅ 54/54 (analyzer pure-function helpers) |
| Phase B scoped tests | ✅ 41/41 (telemetry, schema, Read-tap, tier-builder) |
| Phase C scoped tests | ✅ 22/22 (13 new variant + 9 unchanged existing ranker) |
| Phase D | docs only — `lint:claude-md` clean |

## Manual smoke (deferred to user)

The wave's runtime smoke requires the user to:
1. Launch the IDE — auto-installed hooks from Wave 53a register; ranker telemetry begins capturing on subsequent IDE-orchestrated builds.
2. Run a few IDE-orchestrated sessions to populate `~/.ouroboros/telemetry/ranker-hits.jsonl`.
3. (Optional) Set `contextRanker.mode` to `tuned` or `experimental` to test the variant. Telemetry will distinguish runs by mode.
4. After accumulating ~quarter of unified-corpus sessions, re-run `npx tsx scripts/analyze-ranker-hit-rate.ts` for an authoritative analysis on unified data.

No UI surfaces touched. Manual smoke gate from `~/.claude/rules/manual-smoke-gate.md` does not apply.

## Subagent observations

All four phases ran with `model: "sonnet"` per the global rule.

- Phase A stopped before writing the analysis doc; resumed via SendMessage to run the script + write the report with real numbers.
- Phase B did extensive work (128 tool uses) including extracting `contextPacketBuilderTiers.ts` defensively for the 300-line cap and `hooksRankerReadTap.ts` to keep `hooks.ts` clean. Stopped during a complexity refactor in `selectAndBuildFiles`; resumed cleanly.
- Phase C stopped on a `security/detect-object-injection` lint concern; resumed with a `ReadonlyMap<ContextReasonKind, number>` solution that satisfies the rule.
- Phase D ran clean first try.

Honest mid-wave reframing: I caught a metric-ambiguity issue during Phase A's review (snippet content in `<relevant_code>` makes re-fetch rate narrow); rather than redo Phase A, I incorporated the nuance into Phase B's brief (capture descriptive data, not metric-baked) and Phase D's docs (clarify the ambiguity prominently). Phase A's "redesign" decision per the threshold rules stands; the variant ships per standing direction; future re-runs on unified corpus will be authoritative.

## Known limitations

- **Sample size n=24 in Phase A.** Corpus bias caveat documented. First authoritative re-run after a quarter of unified-corpus accumulation.
- **Variant weights are exploratory, not validated.** Default off; user opts in to test. Module header + docs document this clearly.
- **Re-fetch rate is a narrow metric.** Future analyses should prefer any-hit + recall@k over re-fetch rate.
- **Phase B telemetry observes post-rerank only.** Future wave can attribute to ranker vs reranker separately if needed (would add a second emit point).
- **`docs/context-ranker.md` is 324 lines** — above any soft target. Each section earns its lines (the metric-ambiguity discussion is the load-bearing piece).

## Out-of-wave follow-ups

- **Quarterly re-run of `npx tsx scripts/analyze-ranker-hit-rate.ts`** against the unified corpus. Update variant or escalate to redesign based on the signal.
- **Bayesian weight optimization** — when unified corpus reaches N≥200 sessions with hit data. Separate wave; ADR Decision 2 documents the upgrade path.
- **Learning-to-rank with embedding signals** — if Bayesian plateaus. Substantial implementation cost; defer.
- **PostToolUse → file-touched-per-turn** (Wave 53a audit row #5 partial signal) — Phase A's analysis caveats suggest this might not add as much value as expected. Defer.
- **Metric-comparison dashboard** — using existing telemetry data, compute and display recall@k, any-hit, and re-fetch rate side-by-side. Helps the user calibrate which metric matters for their workflow.
- **Per-user ranker tuning** — if cohort patterns emerge.
- **Cache-hit rate analysis** — separate measurement wave for the 60s packet cache.
