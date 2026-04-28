# Wave 53b — Architectural Decisions

Context Ranker Measurement & Variant. Upfront decisions captured during plan revision; finalized at wave close.

## Decision 1: run analysis on biased corpus + schedule re-runs (option C)

**Context:** Wave 53a's parity infrastructure shipped, but historical session JSONLs weren't retroactively augmented. Today's corpus is still ~40% IDE-orchestrated. Three options: run now on biased corpus, defer 2–4 weeks for unified data, or run now and schedule re-runs.

**Options considered:**
- *Industry standard (defer until clean data):* wait for the unified corpus to accumulate. Most measurement-driven projects defer to clean data. Cost: 2–4 weeks of orchestration debt.
- *Emerging (run + re-run cadence):* run with the bias acknowledged + commit to scheduled re-runs as the unified corpus grows. Used when measurement infrastructure is itself the deliverable.
- *Cutting-edge:* synthetic augmentation of the biased corpus via post-hoc reconstruction. Adds complexity for marginal benefit.

**Pick:** Run now + schedule re-runs — emerging best practice.

**Rationale:** Per user standing direction, Phase C ships regardless. Code lands now. Phase A's decision becomes provisional; future re-runs replace it as the unified corpus grows. Phase B's online telemetry starts capturing fresh signal immediately, so within days there's data that doesn't depend on the biased historical corpus.

**Consequences:** `roadmap/wave-53b-analysis.md` documents the bias and re-run cadence. `session-handoff.md` lists the re-run as a quarterly follow-up. The first analysis is "directionally correct" rather than "definitive."

---

## Decision 2: variant ranker tuning approach — hand-tuned, not Bayesian or LTR

**Context:** The variant ranker can be hand-tuned (pick weights based on bucket analysis), Bayesian-optimized (search the weight space), or learning-to-rank (LTR with pairwise loss). Each has different corpus-size requirements.

**Options considered:**
- *Industry standard (hand-tuned + A/B):* pick weights informed by Phase A's bucket analysis; document the rationale; A/B test against the holdout corpus once unified data is available.
- *Emerging (Bayesian optimization):* parameterize the weight space; optimize against a hit-rate metric using something like Optuna or scikit-optimize. Requires sufficient corpus data to avoid overfitting.
- *Cutting-edge (Learning-to-Rank with embeddings):* pairwise loss over query-document pairs, with embedding-augmented features. Substantial implementation cost; requires graded relevance signals we don't have today.

**Pick:** Hand-tuned — industry standard.

**Rationale:** The corpus isn't ready for Bayesian search yet (~40% biased; even unified, the per-session signal density is low). LTR requires graded relevance which we'd need to instrument separately. Hand-tuned variant ships now, ADR documents the upgrade path: graduate to Bayesian when the unified corpus reaches sufficient size; LTR if Bayesian plateaus.

**Consequences:** Variant weights are a snapshot of "best guess given Phase A's analysis." Future waves graduate to Bayesian without changing the public interface (just swap the variant's internals).

---

## Decision 3: hit-rate metric — recall@k, not NDCG

**Context:** Need a metric to measure "did the ranker surface the right files?" Standard ranking metrics include precision@k, recall@k, MRR, NDCG.

**Options considered:**
- *Industry standard (recall@k + simple "any hit" rate):* fraction of pre-loaded files in top k that were Read. Plus binary: did ANY pre-loaded file get Read in the session?
- *Emerging (MRR — mean reciprocal rank):* favors getting the right answer at rank 1.
- *Cutting-edge (NDCG):* requires graded relevance ("how useful was this file"). We don't have graded relevance signals.

**Pick:** Recall@k for k ∈ {1, 3, 5, 10} + the simple "any hit" rate — industry standard.

**Rationale:** NDCG requires graded relevance we'd need to instrument separately ("was this file *helpful*, *neutral*, or *useless*?"). MRR's rank-1-favoring is reasonable but recall@k captures the actionable question — "did we surface the right files anywhere in our top k?" Simpler. Pairs naturally with the existing ranker's top-k pruning.

**Consequences:** Future waves can add NDCG by instrumenting graded relevance signals (e.g., agent dwells on file = positive; immediately moves to a different file = neutral). For now recall@k is the metric.

---

## Decision 4: Phase B telemetry observes post-rerank output

**Context:** Two candidate hook locations for the online telemetry — pre-rerank (raw `selectContextFiles` output) or post-rerank (after `rerankRankedFiles` mutates ordering).

**Pick:** Post-rerank, at `contextPacketBuilder.ts:300`.

**Rationale:** The agent sees the post-rerank ordering, not the pre-rerank one. Hit-rate is "did the agent Read what we showed it?" — the right baseline is what we showed, which is post-rerank. Pre-rerank measurement would conflate ranker + reranker quality.

**Consequences:** If a future wave wants to attribute hit-rate to ranker vs reranker separately, it'll need a second emit point. Acceptable — single-emit-point keeps Phase B small.

---

## Decision 5: variant defaults off (per user standing direction)

**Context:** Phase C ships a variant ranker. Could default it on (live testing) or off (opt-in).

**Pick:** Default off (`contextRanker.mode = 'current'`).

**Rationale:** User standing direction: "Phase C ships regardless." That implies code lands; behavior change is gated. Default-off is the conservative posture for an unverified variant — the user opts into testing it explicitly. Industry standard for feature flags around behavior change is opt-in until measurement validates the change.

**Consequences:** Variant doesn't get real-world testing automatically; user must flip the flag. Wave 53b's online telemetry will surface variant-vs-current comparison once the user has opted in for some sessions.

---

## Decision 6: per-surface schema discipline (carry-forward from Wave 53a)

**Context:** Phase B writes ranker-hits records to `~/.ouroboros/telemetry/ranker-hits.jsonl`. Wave 53a established the per-surface schema convention.

**Pick:** Phase B follows the convention. New `rankerHitsSchema.ts` exports `RankerSelectionRecord` + `RankerHitRecord` types and version constants.

**Rationale:** Carry-forward of Wave 53a's discipline. Drain handlers stay forward-compatible (skip unknown versions, don't crash). Hook scripts (if any are added in this wave — unlikely; telemetry runs in main process) would mirror the schema in a comment block.

**Consequences:** Documented uniformly. Any future surface added to the ranker telemetry follows the same pattern.

---

## End-of-wave additions

(Filled in at Phase D close.)
