# Wave 52 — Context Ranker Measurement & Tuning
## Implementation Plan (DRAFT)

**Version target:** v2.8.1 (patch — measurement-driven ranker adjustments)
**Feature flags:** new `contextRanker.mode` (`current` | `tuned` | `experimental`, default `current`), new `contextRanker.telemetryEnabled` (default `true`)
**Dependencies:** Wave 48 shipped (spawn telemetry in place)
**References:**
- `src/main/orchestration/contextSelector.ts`
- `src/main/orchestration/contextSelectionSupport.ts`
- `src/main/orchestration/contextPacketBuilder.ts`
- `src/main/orchestration/contextPacketBuilderSupport.ts`
- `src/main/orchestration/types.ts`
- `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl` (historical session data)
- `src/main/orchestration/CLAUDE.md` — current ranker weights

---

## Overview

The IDE pre-loads a ranked list of "relevant code" files into `<relevant_code>` on the first turn of each spawn via `contextSelector.ts`. Current weights:

| Reason | Weight |
|---|---|
| `user_selected` | 100 |
| `pinned` | 95 |
| `included` | 85 |
| `dirty_buffer` | 68 |
| `git_diff` | 56 |
| `diagnostic` | 52 |
| `test_companion` | 38 |
| `recent_edit` | 32 |
| `keyword_match` | 26+ |
| `import_adjacency` | 22+ |

**If the ranker's top files match what the agent actually Reads during the turn, we save Reads. If not, we paid for file snippets the agent ignored.** Nobody has measured which is happening.

Wave 52 builds the measurement, runs it across historical session JSONLs, and makes a tuning/redesign decision based on data.

This wave is **measurement first, change second.** It's the smallest wave in the series by design — most of the work is analysis, not implementation. It's last in sequence because the other waves either reduce the scope of this one (Wave 48 may already have dropped ranker use for casual goals) or produce data this one depends on.

---

## Implementation review summary

### Confirmed state

- `contextSelector.ts` ranks files by summing weighted reasons; confidence tiers `high` / `medium` / `low`.
- `contextPacketBuilder.ts` applies a session-level cache with SHA-1 fingerprint (60s TTL) and model-aware budget (Opus 128KB/32K tokens, Sonnet 72KB/18K tokens, default 48KB/12K tokens).
- `<relevant_code>` block is emitted on turn 0 only (resume turns skip it per `buildResumeContextBlock`).
- No telemetry today on ranker hit rate — no data for tuning.
- Historical session JSONLs at `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl` contain: first-turn user message (with `<relevant_code>` file list in `<file path="...">` tags), all subsequent `Read` tool_use paths.

### Gaps this wave closes

- **No measurement of ranker hit rate.** We don't know if the ranked files are the files the agent Reads.
- **No A/B comparison** of weight schemes on real data.
- **No ranker cache-hit observability** — the 60s TTL may be doing nothing useful if spawns rarely hit it.
- **No decision framework** for "tune existing weights" vs "redesign ranker."

---

## Scope

### In-scope

- Parser that ingests historical session JSONLs, extracts `<relevant_code>` file lists and subsequent Read paths.
- Hit-rate analysis: for each session, compute what fraction of pre-loaded files were actually Read.
- Distribution analysis: which reasons (git_diff, keyword_match, etc.) produce hits vs. noise.
- Offline A/B: apply candidate weight schemes to the same JSONLs, compare hit-rate deltas.
- Decision report: tune in place, or plan a redesign.
- If tuning: ship the new weight scheme behind `contextRanker.mode === 'tuned'`, flip default after soak.
- Telemetry extension: real-time hit-rate tracking on new spawns.

### Out-of-scope

- Changing the ranker's fundamental structure (weighted-sum) without evidence it's the bottleneck.
- Adding new signal sources (e.g., embedding similarity) — that's a different wave.
- Tuning the budget byte/token caps.
- Changing the 60s cache TTL without cache-hit data.

---

## Verified starting point

Reusable:

- `contextSelector.ts`, `contextPacketBuilder.ts` — ranker and budget logic.
- Session JSONLs at `~/.claude/projects/C--Web-App-Agent-IDE/` — data source.
- Wave 48's telemetry infrastructure (`~/.ouroboros/telemetry/*.jsonl`).
- Wave 48's goal classifier — can bucket sessions by code/casual goal.

Explicitly targeted:

- Offline analysis tooling.
- Real-time hit-rate telemetry wiring.
- Weight-tuning experiments.

---

## Architecture

```text
offline analysis (new)
 ├─ scripts/analyze-ranker-hit-rate.ts
 │    ├─ parses JSONL
 │    ├─ extracts <relevant_code> file paths from turn 0
 │    ├─ collects all Read paths from subsequent turns
 │    ├─ computes hit rate per session
 │    └─ buckets by goal classification, rank position, reason source
 ├─ scripts/simulate-ranker-tuning.ts
 │    ├─ re-runs contextSelector against historical repo state (approximate)
 │    └─ compares candidate weight schemes to current
 └─ roadmap/wave-52-analysis.md
      └─ written conclusions from both scripts

online telemetry (extension of Wave 48 infrastructure)
 └─ contextPacketBuilder.ts
      ├─ emits ranker-selection trace per build
      └─ correlates with subsequent Reads at session close
```

**Key design calls:**

- Offline analysis operates on historical JSONLs — it can't re-run the ranker against past repo state perfectly (files may have changed). Use approximation: apply current ranker to current repo state, see if those same files appear in historical Reads.
- Online telemetry is the source of truth going forward. Offline analysis is for the initial calibration.
- If the analysis shows hit rate is already >70%, **do not tune**. Friction without upside.
- If hit rate is <40%, the ranker is probably not a tuning problem — it's a signal-source problem. That would escalate to a redesign wave, not ship weight changes.

---

## Phase A — Offline hit-rate analysis

**Goal:** Build the measurement tool, run it across historical sessions, produce a decision report.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/analyze-ranker-hit-rate.ts` | ~280 | Ingests JSONL, produces per-session stats: total pre-loaded files, Read count, hit rate, hit distribution by rank position. |
| `scripts/analyze-ranker-hit-rate.test.ts` | ~220 | Fixture JSONLs with known expected rates. |
| `roadmap/wave-52-analysis.md` | ~220 | Written findings: hit rate distribution, bucket analysis (code vs casual), recommendations. |

### Modified files

| File | Change |
|---|---|
| `scripts/package.json` (or top-level `package.json`) | Add `npm run analyze:ranker` script. |

### Subagent briefing

- **Read first:** 3–5 sample session JSONLs to understand the concrete structure. Focus on `<relevant_code>` XML extraction and `tool_use.input.file_path` from Read calls.
- **Hit rate definition:** `(files in <relevant_code> that appear in any later Read) / (files in <relevant_code>)`.
- **Bucket by:**
  - Goal classification (if determinable from goal text using Wave 48's classifier): code vs casual.
  - Rank position: was the hit at position 1, 2, 3+?
  - Reason source: hits from `git_diff` vs `keyword_match` vs others (requires re-running selector — if too expensive, skip).
- **Be honest about noise:** short sessions have small denominators; exclude sessions with <3 pre-loaded files or <1 Read.
- Decision rule:
  - >70% hit rate → ranker is fine; wave completes with "no change" decision.
  - 40–70% → tuning candidate; proceed to Phase B.
  - <40% → redesign candidate; document and defer to a future wave.

### Acceptance

- [ ] Analysis script runs successfully against the historical JSONLs.
- [ ] Report doc summarizes findings with hard numbers.
- [ ] Decision is explicit: no change / tune / redesign.
- [ ] Commit: `docs(wave-52): Phase A — ranker hit-rate analysis`

---

## Phase B — Online telemetry

**Goal:** Measure hit rate on new spawns in real time, not just from historical data.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/orchestration/contextRankerTelemetry.ts` | ~220 | Emits per-build trace: selected files + reasons. Correlates with subsequent Reads at session end. Writes to `~/.ouroboros/telemetry/ranker-hits.jsonl`. |
| `src/main/orchestration/contextRankerTelemetry.test.ts` | ~200 | Correlation logic tests. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/contextPacketBuilder.ts` | Emit selection event after ranking. |
| `src/main/hooksSessionHandlers.ts` | On `SessionEnd`, trigger correlation flush. |
| `src/main/configSchemaTail.ts` | Add `contextRanker.telemetryEnabled`. |

### Subagent briefing

- **Read first:** Wave 48's `graphUsageLogger.ts` pattern, `contextPacketBuilder.ts`.
- Correlation happens at session end — collect all Reads that occurred after turn 0, compare to the pre-loaded list.
- Telemetry must be privacy-respectful: record file paths (relative to workspace root, not absolute) and reason tags. Don't record file contents.
- Rotation + size cap on the telemetry file.

### Acceptance

- [ ] New spawns emit ranker-selection traces.
- [ ] SessionEnd flushes per-session hit-rate to JSONL.
- [ ] Telemetry respects `contextRanker.telemetryEnabled` flag.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-52): Phase B — ranker hit-rate telemetry`

---

## Phase C — Tuning experiment (conditional)

**Goal:** Only runs if Phase A decision was "tune." Offline A/B of candidate weight schemes.

### New files (conditional)

| File | ~Lines | Description |
|---|---|---|
| `scripts/simulate-ranker-tuning.ts` | ~260 | Applies candidate weight schemes to the current repo state, compares against historical Read paths. |
| `src/main/orchestration/contextSelectorTuned.ts` | ~200 | Alternate ranker with the tuned weights. Selected via `contextRanker.mode === 'tuned'`. |
| `src/main/orchestration/contextSelectorTuned.test.ts` | ~180 | Scoring tests for the tuned scheme. |

### Modified files (conditional)

| File | Change |
|---|---|
| `src/main/orchestration/contextPacketBuilder.ts` | Switch ranker by `contextRanker.mode` config. |
| `src/main/configSchemaTail.ts` | Add `contextRanker.mode: 'current' \| 'tuned' \| 'experimental'`. |
| `src/main/orchestration/CLAUDE.md` | Update weights table if tuned scheme ships. |

### Subagent briefing

- **Read first:** Phase A report. If decision was "no change," skip this phase entirely.
- Tuned scheme is new weights, not new signals. If new signals are needed, that's a redesign, not a tune.
- Candidate schemes should be derived from Phase A's bucket analysis: if keyword_match is producing noise, lower its weight; if test_companion is under-weighted relative to hit rate, raise it.
- Ship tuned scheme behind a flag, default OFF. Flip default only after online telemetry confirms the tune improves hit rate.

### Acceptance (conditional)

- [ ] Simulation shows tuned scheme ≥10% better hit rate than current on historical data.
- [ ] Tuned ranker implemented with scoped tests.
- [ ] Flag default OFF for initial ship.
- [ ] Commit: `feat(wave-52): Phase C — tuned ranker weights (behind flag)`

---

## Phase D — Decision close and follow-up

**Goal:** Document outcomes; close wave.

### New files

| File | ~Lines | Description |
|---|---|---|
| `docs/context-ranker.md` | ~220 | How ranker works, measured hit rate, tuning choices, how to disable/switch modes. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/CLAUDE.md` | Add gotcha if tuned scheme shipped. |
| `roadmap/session-handoff.md` | Record flip-flag criteria for tuned → default. |

### Acceptance

- [ ] Documentation reflects final state (no-change / tuned / redesign-deferred).
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-52): Phase D — context ranker documentation`

---

## Subagent execution model

- **Model:** `sonnet`
- **Isolation:** sequential on `master`
- **Test policy:** scoped vitest per phase; parent runs full suite at wave close
- **Lint policy:** no relaxations
- **Commit policy:** one per phase; Phase C may not exist depending on Phase A outcome
- **Scope discipline:** do NOT add new signal sources (embeddings, LSP symbol queries) — that's a separate wave. Only tune existing weights.

### Phase dispatch order

1. **Phase A** — offline analysis (foundational — drives whether C runs)
2. **Phase B** — online telemetry (parallel-safe with A; starts collecting immediately)
3. **Phase C** — tuning experiment (only if A decided "tune")
4. **Phase D** — close + docs

---

## Risks

| Risk | Mitigation |
|---|---|
| Historical JSONLs aren't representative — too few "real" sessions. | Document the sample size in the analysis doc; weight findings by confidence. |
| Hit rate is already high (>70%) and the wave concludes with no change. | That's a valid outcome — the wave delivered measurement infrastructure. Document and move on. |
| Tuned weights regress on one bucket while improving another. | Per-bucket reporting in simulation — refuse to ship if any bucket regresses >5%. |
| Online telemetry distorts ranker behavior (observer effect). | Telemetry is post-build only; doesn't affect ranker decisions. |
| Phase A shows redesign is needed. | Fine — wave closes with documentation + deferred redesign wave. Don't force a half-measure tune. |

---

## Acceptance criteria (wave-level)

- [ ] At minimum two phase commits on `master` (A + D); B and C conditional.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke:
  - [ ] `npm run analyze:ranker` produces a readable report.
  - [ ] Online telemetry writes to JSONL on session end.
  - [ ] If tuned scheme shipped: flag toggles between current and tuned; both produce valid packets.

---

## Out-of-wave follow-ups

- **Signal redesign** (possible Wave 54+) if hit rate is <40% even after tuning.
- **Embedding-based relevance** as an additional signal source, evaluated against the hit rate baseline.
- **Per-user ranker tuning** — users whose workflow differs (pure-backend vs. full-stack) might benefit from bucket-specific weights.
- **Cache-hit rate analysis** for the 60s packet cache — separate measurement.
