# Wave 53c — Corpus Analysis & Decision Report

**Date:** 2026-04-28
**Analyzer commit:** Phase B at `6f6e30d`
**Output artifacts:** `roadmap/wave-53c-output/corpus-analysis.{json,csv}`
**Corpus:** `~/.claude/projects/C--Web-App-Agent-IDE/` — 369 sessions spanning 2026-03-29 → 2026-04-28 (5 weeks)

---

## Executive verdict (FINAL — supersedes initial reading)

| Question | Answer |
|---|---|
| Wave 54 (TS semantic operations) start gate | **PAUSED. Blocked on Wave 53d (graph-tool adoption fix), not greenlit.** |
| Wave 53c Phase D (router backfill) | **No-Go this wave.** Live telemetry (restored in Wave 53) is the more durable signal. |

**Headline finding (uncovered post-initial-read):** the existing graph/symbol tool layer (`get_architecture`, `search_symbols`, `get_symbol`, `trace_imports`, `detect_changes`, `get_codebase_context` exposed via `src/main/internalMcp/`) saw **0 calls in 369 sessions**. Not "few." Not "underused." **Zero.** Across 4,601 `Grep + Glob + Read` calls, the agent reached for the graph-aware tools exactly never.

This finding supersedes the initial threshold-driven verdict. The corpus *did* show high navigation cost (15.2% of sessions hit grep-loop depth ≥3, with the deepest sessions pairing depth-11 search bursts with 40+ Edits). But the threshold conclusion — "Wave 54 read-only ops are justified" — assumed agents would use new symbol tools if shipped. The 0% adoption of existing symbol tools, plus a root-cause diagnostic showing the rule documenting these tools points at names the IDE doesn't actually expose AND that the MCP server's auto-inject is broken, says the gap is **wiring**, not behavior. Until the wiring is fixed and live adoption is measured, Wave 54's new tools would inherit the same dead-letter dynamic.

ADR Decision 11 captures the reframe in detail. Wave 53d is opened to fix the adoption gap; Wave 54's plan stays in `roadmap/wave-54-plan.md` with status BLOCKED on Wave 53d's outcome.

The threshold-driven analysis below is preserved as historical context — the numbers are correct; the conclusion was based on an unexamined assumption (that agents would use symbol tools if available) that the broader diagnostic invalidated.

---

## Methodology

### Corpus

- 369 session JSONLs from `~/.claude/projects/C--Web-App-Agent-IDE/`.
- Date range: 2026-03-29 → 2026-04-28 (5 ISO weeks).
- Distribution: W13 (104 sessions), W14 (77), W15 (30), W16 (113), W17 (45). W15's dip aligns with the Easter holiday week.

### Per-session metrics

- **Edit first-try failure rate** — `tool_result.is_error: true` whose parent `tool_use` was `Edit` and whose content matches `/String to replace not found in file/i`. Regex grounded in two real corpus quotes (sessions `29b99c29`, `2be858a5`). ADR Decision 3.
- **Max grep-loop depth** — longest consecutive run of `Grep`/`Glob` `tool_use` records with no intervening `Read`/`Edit`/`Write`. ADR Decision 4.
- **Intent bucket** — first non-continuation user prompt classified via `scripts/intent-classifier.ts` (Phase A). Seven buckets: bug-fix / feature / refactor / review / meta-ux / continuation / other.

### Thresholds

Taken verbatim from `roadmap/wave-54-plan.md` lines 30–34. ADR Decision 5 — no recalibration based on findings.

- T1: ≥10% of turns show grep-loop depth ≥3
- T2: ≥15% of Edits fail on first attempt
- T3: ≥5% of turns have rename/refactor intent AND those turns show above-average failure rates

---

## Corpus characteristics & sample bias

| Stat | Value | Note |
|---|---|---|
| Total sessions | 369 | |
| Sessions with ≥1 Edit attempt | 95 (25.7%) | The other 74% are read-only sessions (questions, reviews, meta) |
| Sessions <60s duration | 224 (60.7%) | Trivial / aborted / "hi" sessions; significant noise floor |
| Substantive sessions (≥60s) | 145 (39.3%) | Where the actual work lives |
| Median session duration | 21s | Pulled down hard by the 60% trivial tail |
| p90 session duration | 14,825s (~4.1 hr) | Substantive sessions are long |
| Total Edit attempts | 2,239 | |
| Total Edit first-try failures | **4** | |
| Corpus-wide first-try failure rate | **0.18%** | |

### Files most often touched (top 8)

A measure of what kind of work the corpus represents. Not what Wave 54 would help with directly, but tells us if this corpus is representative of *typical* work.

```
1. (no entry — top filtered out by sessionCount tie-break)
2. preloadSupplementalApis.ts (12)
3. package.json (11)
4. electron.vite.config.ts (11)
5. claudeUsagePoller.ts (10)
6. useAgentChatWorkspace.ts (10)
7. configSchemaTail.ts (10)
8. App.tsx (10)
```

### Sample-bias notes

1. **Recent-wave dominance.** The 5-week window is dominated by Wave 51 (CodeMode), Wave 52 (telemetry queue), Wave 53/53a/53b (telemetry/ranker), and Waves 58/59 (UI closeout). The corpus is heavy on telemetry/UI work and light on the kind of TS refactoring Wave 54 was designed to help with.

2. **Process discipline filtering.** Recent work has emphasized wave-process discipline — tighter scope, sub-agent dispatch with structured briefs, more upfront planning. This systematically suppresses the "agent flounders trying to find the right symbol" pattern Wave 54 targets. Earlier work (pre-Wave 50) might show different numbers.

3. **Trivial-session pollution.** 60.7% of sessions are <60 seconds. These wash out per-bucket means and inflate denominators. The threshold checks below are reported corpus-wide and substantive-only.

4. **Refactor n=21.** Small bucket. Six of those 21 sessions had any Edit activity at all. Confidence in the refactor-bucket numbers is low.

5. **Edit-failure regex coverage.** The regex matches the canonical phrase Anthropic currently emits. If older sessions used a different phrase variant, those failures are undercounted. The regex is logged in the analyzer's `EDIT_MISMATCH_RE` constant for future verification.

---

## Findings

### Intent distribution

| Bucket | Sessions | % of corpus |
|---|---|---|
| bug-fix | 154 | 41.7% |
| feature | 71 | 19.2% |
| other | 49 | 13.3% |
| meta-ux | 43 | 11.7% |
| review | 31 | 8.4% |
| refactor | 21 | 5.7% |
| continuation | 0 | 0.0% |

Bug-fix dominates — consistent with mid-wave-process work where waves frequently uncover defects. Refactor is the smallest substantive bucket at 5.7% (just above T3's 5% prevalence floor).

### Per-bucket metrics

| Bucket | Sessions | w/Edits | Edit attempts | Edit fails | Fail rate | % with depth ≥3 |
|---|---|---|---|---|---|---|
| bug-fix | 154 | 48 | 799 | 3 | **0.38%** | 15.6% |
| feature | 71 | 8 | 129 | 0 | 0.00% | 4.2% |
| other | 49 | 12 | 314 | 0 | 0.00% | 16.3% |
| meta-ux | 43 | 7 | 208 | 1 | 0.48% | 16.3% |
| review | 31 | 18 | 728 | 0 | 0.00% | **38.7%** |
| refactor | 21 | 2 | 61 | 0 | 0.00% | 9.5% |

### Deepest observed grep-loops

The five sessions with the highest `maxGrepLoopDepth`:

| Depth | Bucket | Edits | Session prefix |
|---|---|---|---|
| 11 | meta-ux | 2 | `439565f2` |
| 11 | bug-fix | 58 | `53126dd6` |
| 11 | refactor | 47 | `acb33ba1` |
| 9 | review | 40 | `c40012b1` |
| 8 | bug-fix | 44 | `dafdd362` |

Three of these five sessions paired deep grep-loops with 40+ Edits — exactly the workflow Wave 54's read-only ops would help. The behavior exists; it's concentrated in a small number of long sessions.

---

## Threshold check

### T1 — ≥10% of turns show grep-loop depth ≥3

**Corpus-wide:** 56 / 369 sessions = **15.2%** show max depth ≥3.

**Caveat — measurement granularity:** the analyzer measures *session-max* depth, not per-turn depth. Per-turn rate is necessarily lower (most turns within a session don't hit search bursts). Whether the per-turn rate is still ≥10% is uncertain without finer telemetry. A conservative reading: session-level signal is met but with margin tighter than face value suggests.

**By bucket:** review 38.7% > meta-ux/other 16.3% > bug-fix 15.6% > refactor 9.5% > feature 4.2%.

**Verdict: T1 met at session level; ambiguous at literal per-turn level.** Stated as **conditionally met.**

### T2 — ≥15% of Edits fail on first attempt

**Corpus-wide:** 4 / 2,239 Edit attempts = **0.18%**.

**Per-bucket peak:** bug-fix at 0.38%. Even the worst bucket is **40× below** the 15% threshold.

**Verdict: T2 decisively NOT met.** This is the strongest finding in the report. The "Edit's `old_string` doesn't match" failure mode that Wave 54's `replaceSymbolBody` was designed to address occurs at a rate of approximately 1 in 560 Edit attempts on real workload.

### T3 — ≥5% of turns have rename/refactor intent AND above-average failure rates

**Refactor prevalence:** 21 / 369 = **5.7%** of corpus. Marginally above 5% floor.

**Refactor failure rate:** 0 / 61 attempts = **0.00%**.

**Corpus average failure rate:** 0.18%. Refactor at 0.00% is **below**, not above, average.

**Verdict: T3 NOT met.** Compound condition fails on the second clause.

---

## Decision (HISTORICAL — superseded by executive verdict above)

> **Note:** This section captures the threshold-driven decision derived directly from the corpus numbers. It is preserved as historical context. The executive verdict at the top of the report supersedes this section after the post-Phase-C diagnostic revealed the 0% graph-tool adoption gap. ADR Decision 11 documents the reframe.

### Wave 54 — TypeScript Semantic Operations

**Conditional Go.** The wave's plan splits into:

- **Phase A+B (read-only ops — `find_references`, `get_symbol_body`):** **GO.** T1 supports the plumbing. The deep-grep-loop pattern is real even if rare; read-only ops can address it. The infrastructure is reused if Phase D is later justified.
- **Phase C (measurement gate inside Wave 54):** **GO** as designed. The wave's own internal gate is the right place to decide on mutations.
- **Phase D (symbol mutations — `replaceSymbolBody`, `insertBeforeSymbol`/`After`):** **NO-GO** based on this analysis. T2 collapsed at 0.18% — there is no Edit-failure pain to fix. Phase D ships only if Wave 54's own Phase C measurement (post-Phase-B uptake) shows the agent uses semantic ops AND the resulting Edit-failure-or-equivalent metric warrants mutation.

This split is what Wave 54's plan already contemplated. The corpus data confirms the wave's internal staging was the right call.

**Counterargument considered:** "Process discipline filtered the bad behavior out — Wave 54 might have helped during Wave 30s when refactoring was heavier." Possibly true, but this analysis measures current behavior on current workload. Wave 54 ships into the current workload, not a counterfactual past. The data we have says *now* Edit failures are rare; we ship for what's true now.

### Wave 53c Phase D — router backfill

**No-Go this wave.** Two reasons:

1. **Live telemetry is the better signal.** Wave 53 restored router-feature telemetry. Live capture as work happens is more durable than synthetic backfill on a 369-session sample.
2. **Backfill output's value is downstream.** Synthetic `EnrichedRoutingLogEntry` rows are only useful if a router-retrain wave wants offline-eval material. No retrain wave is queued; building the input artifact for a wave-not-yet-spec'd is premature.

**Reopening criteria:** if a future router-retrain wave is planned, Phase D's scope (~340 lines + tests) can be folded into that wave's Phase A.

---

## Caveats & limits of this analysis

1. **Sample size.** 369 sessions / 145 substantive ≈ 1 month of work. The thresholds are nominally met or not met, but n=21 in the refactor bucket is small enough that the bucket-level numbers are directional, not authoritative.

2. **Sample bias toward telemetry/UI work.** Top files-touched include config schemas, telemetry, IPC plumbing, UI scaffolds. Pure-TS-refactor sessions (where Wave 54 would shine) are under-represented.

3. **Edit-failure detection is narrow.** The regex matches one canonical phrase. False-negatives if Anthropic varies phrasing across versions; false-positives extremely unlikely (the phrase is specific).

4. **Grep-loop is session-max, not per-turn.** Per-turn measurement would tighten T1's read.

5. **Process discipline confound.** Recent waves emphasized structured planning; this likely suppresses the wandering-search pattern Wave 54 targets. A pre-process-discipline corpus might tell a different story.

6. **Classifier `meta-ux` may inflate** on shell-syntax prompts containing "claude". Phase A's classifier is documented; future iterations can tighten the regex set.

---

## Out-of-wave follow-ups

- **Quarterly re-run.** `npm run analyze:corpus` against accumulated corpus. The reusable analyzer makes this a 5-second diff per quarter.
- **Per-turn grep-loop measurement.** Phase B's metrics are session-aggregated. A future telemetry signal capturing per-turn search-burst depth would tighten T1's read. Not blocking.
- **Wave 54 Phase A+B kickoff.** Per the conditional Go above. Phase A+B share the tsserver infrastructure cost; Phase C's measurement decides Phase D.
- **Live-telemetry router calibration.** Once live router telemetry accumulates ~1K turns post-Wave 53, run the router-feature distribution against the classifier's training assumption. That's a smaller, more focused question than Phase D's full backfill.
- **Phase B `topPromptPatternsByBucket` refinement.** Currently uses dominant-tool-name as a pattern proxy. If a future report needs actual prompt-text patterns, extend Phase B's parser. Not load-bearing for this decision.

---

## Acceptance for Phase C

- [x] Decision report exists.
- [x] Wave 54 start gate explicitly answered (PAUSED — blocked on Wave 53d's adoption-gap fix).
- [x] Phase D (router backfill) explicitly answered (No-Go this wave).
- [x] Every claim cites a number from the analyzer JSON or CSV.
- [x] Sample-bias section present.
- [x] 0% graph-tool adoption finding documented and reframed the verdict (ADR Decision 11).
