# Wave 53b — Context Ranker Measurement & Variant

## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-27 · Released as v2.10.0 · Result: `roadmap/auto-briefs/wave-53b-result.md`
**Version target:** v2.10.0 (minor — new agent capability surface; variant ranker + ranker telemetry)
**Feature flags:** new `contextRanker.mode` (`current` | `tuned` | `experimental`, default `current`); new `contextRanker.telemetryEnabled` (default `true`)
**Dependencies:** Wave 52 ✅ (queue infrastructure), Wave 53a ✅ (telemetry parity, post-hoc shadow router)
**References:**
- `roadmap/decisions/wave-53b.md` — upfront architectural decisions
- `src/main/orchestration/contextSelector.ts` (entry to the ranker)
- `src/main/orchestration/contextSelectorScoring.ts` (where weight constants live)
- `src/main/orchestration/contextSelectorRanker.ts` (the actual scoring loop)
- `src/main/orchestration/contextReranker.ts` (post-rerank stage; agent sees this output)
- `src/main/orchestration/contextPacketBuilder.ts:300` (post-rerank emit point for online telemetry)
- `src/main/orchestration/providers/goalClassifier.ts` (bucketing tool)
- `src/main/orchestration/providers/claudeCodeContextBuilder.ts:74` (where `<relevant_code>` XML is emitted into the prompt)
- `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl` (522 session JSONLs — historical corpus)
- `src/main/telemetry/telemetryQueue.ts` / `telemetryDrain.ts` (Wave 52 primitives reused)
- `src/main/router/routerShadowDrainHandler.ts` (Wave 53a — pattern reference for post-hoc telemetry)
- `~/.ouroboros/telemetry/` (telemetry sink dir; new file `ranker-hits.jsonl`)

---

## Why this wave

The IDE pre-loads a ranked file list into `<relevant_code>` on turn 0 of each spawn. Current weights are documented in `src/main/orchestration/CLAUDE.md`:

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

**Nobody has measured whether the ranker's top files match what the agent actually Reads during the turn.** If they match, Reads are saved. If not, we paid for snippets the agent ignored.

Wave 53b measures hit rate (offline + online), ships a variant ranker behind a flag, and produces a decision report that future iterations build on. Wave 53a's parity infrastructure means future runs of this analysis will draw from a unified corpus instead of the current ~40% IDE-orchestrated subset.

---

## Implementation review summary

### Confirmed state (2026-04-27)

- ✅ Ranker exists, decomposed across 18 files in the `contextSelector*` and `contextReranker*` families. Phase B's online-telemetry hook lives at `contextPacketBuilder.ts:300` after `await rerankRankedFiles(...)` — observes the final ranking the agent sees.
- ✅ Goal classifier (`goalClassifier.ts`, 78 lines, regex-based, returns `code` / `casual` / `unknown`) is the bucketing tool for Phase A.
- ✅ Wave 52 + 53a parity infrastructure in place: `telemetryQueue.ts`, `telemetryDrain.ts`, `~/.ouroboros/telemetry/queue/` directory, auto-install for hooks.
- ✅ 522 session JSONLs in `~/.claude/projects/C--Web-App-Agent-IDE/`.
- ⚠️ **Unified corpus is NOT yet populated at runtime.** Wave 53a auto-install runs on next IDE boot. Today's corpus is still ~40% IDE-orchestrated. Wave 53b's offline analysis will operate on biased data initially; scheduled re-runs draw from the increasingly-unified corpus.

### Gaps this wave closes

- **No measurement of ranker hit rate.** No data for tuning.
- **No real-time hit-rate tracking** on new spawns.
- **No flag for trying alternate weight schemes** without overwriting the live ranker.
- **No decision framework** for "is the ranker good enough" — Wave 53b establishes the metrics + thresholds.

### Architectural decisions

Captured in detail in `roadmap/decisions/wave-53b.md`. Summary of the upfront calls:

- Run the analysis now on the biased corpus + schedule re-runs (option C from planning) — code lands; decision is provisional; future re-runs replace it as the unified corpus grows.
- Variant ranker tuning: hand-tuned weights informed by Phase A's bucket analysis (industry standard) — Bayesian and learning-to-rank deferred until corpus supports them.
- Hit-rate metric: recall@k + simple "any hit" rate (industry standard) — NDCG deferred (we don't have graded relevance signals).
- Phase B telemetry observes post-rerank output (the final ranking the agent sees).
- Variant defaults off; user opts in via `contextRanker.mode` flag (per user standing direction "Phase C ships regardless").
- Per-surface schema discipline applies (Wave 53a discipline carries forward).

---

## Phase A — Offline analyzer + decision report

**Goal:** Build the measurement tool, run it across the corpus, produce a decision report. Acknowledge the corpus bias explicitly.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/analyze-ranker-hit-rate.ts` | ~320 | tsx-runnable. Walks `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl`. Per session, extracts `<relevant_code>` file paths from turn 0 and all subsequent `Read` tool_use file paths. Computes per-session hit rate, recall@k for k ∈ {1, 3, 5, 10}, distribution by goal bucket (via `goalClassifier`). Writes archive to `roadmap/wave-53b-data.json` and human report to stdout. |
| `scripts/analyze-ranker-hit-rate.test.ts` | ~220 | Fixture JSONLs with known expected rates. |
| `roadmap/wave-53b-analysis.md` | ~240 | Findings: corpus stats, hit-rate distribution, per-bucket analysis, recall@k table, sample top-10-rank misses, decision (no change / tune / redesign). Explicit corpus-bias acknowledgment + scheduled re-run note. |

### Subagent briefing

- **Read first:** wave plan; wave-53b ADR; `goalClassifier.ts`; sample 3–5 session JSONLs to confirm `<relevant_code>` XML extraction shape; `claudeCodeContextBuilder.ts:74` for the canonical XML format.
- Hit rate definition: `(files in <relevant_code> that appear in any later Read) / (files in <relevant_code>)`. Compute per session.
- Recall@k: among the top-k files in `<relevant_code>` (sorted by score), fraction that were Read. Compute for k ∈ {1, 3, 5, 10}.
- Bucket sessions by `classifyGoal(turn0_user_message)` — `code` / `casual` / `unknown`.
- Filter sessions: skip those with <3 pre-loaded files OR <1 Read (denominator-too-small noise).
- Decision rule:
  - ≥70% hit rate → no change recommended
  - 40–70% → tune (Phase C ships variant)
  - <40% → redesign recommended (variant ships anyway as a starting point)
- The corpus is biased (~40% IDE-orchestrated). Phase A acknowledges this explicitly and notes the re-run schedule.
- **No code changes outside the script and report doc.** Phase A is read + write doc.

### Acceptance

- [ ] Analysis script runs against historical JSONLs.
- [ ] Report doc summarizes findings with hard numbers.
- [ ] Corpus bias acknowledged; re-run cadence documented.
- [ ] Decision explicit: no change / tune / redesign.
- [ ] Scoped tests pass.
- [ ] Commit: `docs(wave-53b): Phase A — offline ranker hit-rate analysis`

---

## Phase B — Online telemetry

**Goal:** Real-time hit-rate tracking. Doesn't depend on the historical corpus's biases.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/orchestration/contextRankerTelemetry.ts` | ~220 | Emits a ranker-selection event after `rerankRankedFiles` returns. Buffers per session; on session-end, correlates pre-loaded files against subsequent Reads (collected via existing PreToolUse hook events from Wave 53a). Writes to `~/.ouroboros/telemetry/ranker-hits.jsonl`. |
| `src/main/orchestration/contextRankerTelemetry.test.ts` | ~200 | Selection event shape; correlation logic; flush on session-end. Mock fs to avoid pollution. |
| `src/main/orchestration/rankerHitsSchema.ts` | ~60 | Per-surface schema (Wave 53a discipline): `RankerSelectionRecord` + `RankerHitRecord`, schema versions. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/contextPacketBuilder.ts` | After `rerankRankedFiles(...)` at line ~300, emit a ranker-selection event via `contextRankerTelemetry`. Pass workspace + session ID. |
| `src/main/hooksSessionHandlers.ts` | On session-end, trigger correlation flush via `contextRankerTelemetry.flushSession(sessionId)`. |
| `src/main/configSchemaTailExt.ts` (or wherever the existing `contextRanker` namespace lives) | Add `contextRanker.telemetryEnabled` (default `true`). |
| `src/main/configAppTypes.ts` | Add the matching field. |

### Subagent briefing

- **Read first:** wave plan; `src/main/hooksGraphUsageTap.ts` (Wave 48 telemetry tap pattern); `src/main/orchestration/contextPacketBuilder.ts` (post-rerank emit point); Wave 53a's per-surface schema discipline.
- Ranker-selection event shape: `{ sessionId, workspaceRoot, ts, files: [{ path, score, confidence, reasons }], totalFiles }`.
- Hit correlation: maintain in-memory map of `sessionId → preLoadedPaths`. On Read tool-use event (already fed by Wave 53a's hook-events drain), check if path is in the set; emit a hit. On session-end, flush per-session summary record.
- Privacy: record paths relative to workspace root (not absolute). No file contents.
- Telemetry respects `contextRanker.telemetryEnabled` — disabled flag is a no-op.
- **Do not modify the ranker itself.** This phase observes; Phase C tunes.

### Acceptance

- [ ] Selection events emitted on every IDE-orchestrated build.
- [ ] Session-end flushes per-session hit-rate summary.
- [ ] Telemetry respects `contextRanker.telemetryEnabled` flag.
- [ ] Per-surface schema discipline followed (TS schema + comment-mirror in any hook touchpoints).
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-53b): Phase B — ranker hit-rate telemetry`

---

## Phase C — Variant ranker behind `contextRanker.mode`

**Goal:** Ship a variant weight scheme behind a flag. Default `current`. User opts into `tuned` or `experimental` to test.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/orchestration/contextSelectorRankerVariant.ts` | ~220 | Alternate weight scheme. Same interface as `contextSelectorRanker.ts`; different weight constants. Variant choice informed by Phase A's analysis (or sensible exploratory tweaks if Phase A says "no change"). |
| `src/main/orchestration/contextSelectorRankerVariant.test.ts` | ~200 | Scoring math for the variant scheme. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/contextSelector.ts` (or wherever ranker selection happens) | Read `contextRanker.mode` from config. Switch between `current` (existing ranker), `tuned` (variant), `experimental` (variant with more aggressive tweaks; can share variant module if simple toggle). |
| `src/main/configSchemaTailExt.ts` | Add `contextRanker.mode: 'current' | 'tuned' | 'experimental'` (default `'current'`). |
| `src/main/configAppTypes.ts` | Add the matching field. |
| `src/main/orchestration/CLAUDE.md` | Add a one-line gotcha noting the variant exists and points at the config flag. Stay ≤200 lines. |

### Subagent briefing

- **Read first:** Phase A's analysis report + Wave 53b ADR for the variant rationale; `contextSelectorRanker.ts` (existing scheme); `contextSelectorScoring.ts` (where weight constants live).
- Variant weight scheme — pick informed by Phase A's findings. If Phase A says "no change" (≥70% hit rate), variant can be a sensible exploratory tweak (e.g., lower `keyword_match` weight, raise `git_diff` weight) so the flag has something to test. If Phase A says "tune," follow its recommendations. Either way, document the rationale in the variant module's header and in the ADR's final-decisions section.
- New signals are out of scope. Only adjust existing weights.
- Variant ships **default off**. Per-bucket regression check: if Phase A's data shows variant regresses any goal bucket by >5%, document that in the variant header.
- The flag selects ranker module at the call site in `contextSelector.ts` — keep the switch minimal.

### Acceptance

- [ ] Variant ranker implemented with scoped tests.
- [ ] `contextRanker.mode` config flag exists; default `current`.
- [ ] Switching mode in config produces different rankings (verified by test).
- [ ] Variant rationale documented in module header + ADR.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-53b): Phase C — variant ranker behind contextRanker.mode flag`

---

## Phase D — Close + docs + finalize ADR

**Goal:** Document the wave's outputs. Update the ADR with end-of-wave decisions (variant weight rationale, etc.).

### New files

| File | ~Lines | Description |
|---|---|---|
| `docs/context-ranker.md` | ~260 | How the ranker works; the weight schemes (current + variant); how to flip modes; how online telemetry works; how to re-run the offline analysis; the corpus-bias caveat and re-run cadence. |

### Modified files

| File | Change |
|---|---|
| `roadmap/decisions/wave-53b.md` | Finalize end-of-wave decisions: variant weight rationale, Phase A's actual outcome, any deviations from the upfront plan. |
| `CLAUDE.md` (project root) | Add `docs/context-ranker.md` to "Further Reading". |
| `roadmap/session-handoff.md` | Wave 53b follow-ups: re-run cadence (suggested quarterly), graduation path to Bayesian / LTR if corpus grows enough, signal-redesign wave conditions. |

### Acceptance

- [ ] Doc covers ranker, modes, telemetry, hit-rate measurement, re-run procedure.
- [ ] ADR finalized with actual outcomes.
- [ ] CLAUDE.md and session-handoff updated.
- [ ] `lint:claude-md` clean.
- [ ] Commit: `docs(wave-53b): Phase D — context ranker documentation + ADR finalization`

---

## Subagent execution model

- **Model:** `model: "sonnet"` on **every** Agent dispatch. No exceptions.
- **Isolation:** sequential on `master`; no worktrees.
- **Test policy:** scoped vitest per phase; orchestrator runs full suite at wave close.
- **Commit policy:** one per phase.
- **Push policy:** orchestrator pushes once at wave close (this run includes the rule update + ADR backfills + Wave 53b).

### Phase dispatch order

1. **Phase A** — offline analyzer (foundational; informs Phase C variant)
2. **Phase B** — online telemetry (independent of A; could run in parallel but sequenced for simplicity)
3. **Phase C** — variant ranker (informed by A)
4. **Phase D** — close + docs + ADR finalization

---

## Risks

| Risk | Mitigation |
|---|---|
| Corpus bias on Phase A's analysis. | Explicit acknowledgment + scheduled re-runs once unified corpus accumulates. |
| Variant weights regress on a goal bucket. | Phase A reports per-bucket numbers; variant header documents any known regressions. Variant defaults off; user opts in. |
| Online telemetry has high overhead. | Respects `contextRanker.telemetryEnabled` flag; can be disabled. Selection event is a small structured log, not full file content. |
| Hit-rate metric misleading (e.g., session reads same file 5×). | Recall@k counts unique files; documented. |
| Ranker decomposition (18 files) makes Phase C edits hard to scope. | Phase C touches the call site in `contextSelector.ts` and adds the new variant module. The 18-file inner structure stays. |
| Subagent stops mid-tool-loop. | Resume via SendMessage. Each phase commit is the recoverable checkpoint. |

---

## Acceptance criteria (wave-level)

- [ ] Four phase commits on `master` (plus the upfront rule update + ADR backfill commits + final result-brief commit).
- [ ] `npx vitest run` (timeout 800) — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run lint:claude-md` — 0 errors.
- [ ] Manual smoke (deferred to user):
  - [ ] Run offline analyzer; confirm report doc lands.
  - [ ] Launch IDE; verify online telemetry emits to `~/.ouroboros/telemetry/ranker-hits.jsonl`.
  - [ ] Flip `contextRanker.mode` to `tuned`; verify ranker output differs from default.
- [ ] Result brief at `roadmap/auto-briefs/wave-53b-result.md`.
- [ ] ADR finalized at `roadmap/decisions/wave-53b.md`.
- [ ] Status flipped to ✅ COMPLETED.
- [ ] Single push at wave close.

---

## Out-of-wave follow-ups

- **Re-run offline analysis quarterly** — `npx tsx scripts/analyze-ranker-hit-rate.ts`. Update the variant or escalate to redesign based on unified-corpus signal.
- **Bayesian weight optimization** — when the unified corpus reaches sufficient size, graduate from hand-tuned to Bayesian over the weight space. Requires a holdout-corpus split for honest evaluation.
- **Learning-to-rank with embedding signals** — if Bayesian plateaus, embedding-augmented LTR is the next-generation move. Requires substantial implementation cost; defer until signal warrants.
- **PostToolUse → file-touched-per-turn** (audit row #5 partial signal) — deferred from Wave 53a. Phase A's analysis can decide whether the partial signal would help.
- **Per-user ranker tuning** — users with different workflows (backend-only vs full-stack) may benefit from bucket-specific weights. Speculative; hold until cohort data exists.
- **Cache-hit rate analysis** — the 60s packet cache may be unused if spawns rarely repeat. Separate measurement wave.
