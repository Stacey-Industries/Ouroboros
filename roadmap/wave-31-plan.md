# Wave 31 — Learned Context Ranker (LTR) + Lean Packet Mode

## Implementation Plan

**Version target:** v2.0.1 (patch)
**Feature flag:** `context.learnedRanker` (default `false`; flip after 2-week soak + ≥1000 outcome samples).
**Secondary flag:** `context.packetMode` = `'full' | 'lean'` (default `'full'`; flip to `'lean'` after 2 weeks).
**Reference:** `roadmap/roadmap.md:1439-1494`.
**Prior art:** router infrastructure (`tools/train-router.py`, `src/main/router/classifier.ts`, `src/main/router/retrainTrigger.ts`) — mirror its shape verbatim.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **Training script** — `tools/train-context.py` mirrors `train-router.py`. Joins `context-decisions.jsonl` ↔ `context-outcomes.jsonl` on `(traceId, fileId)`. Labels: `used=1`, `unused=0`, `missed=synthetic-neg` for included-but-irrelevant. Pointwise logistic. Outputs `context-retrained-weights.json`. | `tools/train-context.py` (new), plus a syntax-check / JSON-schema fixture |
| B | **Classifier module** — `contextClassifier.ts` mirrors `router/classifier.ts`: feature vector → sigmoid → relevance probability. Loads weights from `context-retrained-weights.json`; falls back to bundled defaults. Exposes `score(features)` + `reloadContextWeights()`. | `src/main/orchestration/contextClassifier.ts` (new), `src/main/orchestration/contextClassifierDefaults.ts` (new — bundled weights), test files |
| C | **Retrain trigger** — `contextRetrainTrigger.ts` mirrors `router/retrainTrigger.ts`: every N new outcome lines (N=200), spawn `python tools/train-context.py`, on success call `reloadContextWeights()`. Log weight version. | `src/main/orchestration/contextRetrainTrigger.ts` (new), test |
| D | **Selector refactor** — `contextSelector.ts` switches from additive hand-tuned weights to `contextClassifier.score(features)`. Existing reasons become feature channels, not scalars. Wave 24 reranker still runs on top of top-N. Preserve the current scoring behavior behind the `context.learnedRanker` feature flag — when off, fall back to the additive path. | `src/main/orchestration/contextSelector.ts` (major), `src/main/orchestration/contextSelectorFeatures.ts` (new — feature extraction), tests |
| E | **Lean packet mode** — config key `context.packetMode: 'full' \| 'lean'`. Lean drops `<project_structure>`, caps `<relevant_code>` to top 6 files, keeps `<workspace_state>`, `<current_focus>`, PageRank repo map (~500 tokens), `<system_instructions>`. | `src/main/orchestration/providers/claudeCodeContextBuilder.ts` (branch on mode), config schema slice, settings UI section, test |
| F | **Observability + docs** — weight-version log line on hot-swap, dashboard card (Observability → Context tab) showing: current weight version, last retrain, held-out AUC if reported by train-context.py, feature importance top-5. Extends Wave 30 Phase H scaffolding. | `src/main/ipc-handlers/contextRankerDashboardHandlers.ts` (new), renderer card, test |

**Phase order rationale:** A writes the training script first so weight artifact shape is fixed before B consumes it. B + C are parallel-safe after A. D depends on B (needs classifier API). E is independent — can land any time. F depends on all earlier phases being in place.

**Soak gate:** With feature flag off, `contextClassifier` loads, features are extracted, but the score is logged only (A/B telemetry) — the selector still uses the additive path. Flip to `learnedRanker: true` after 2 weeks + ≥1000 samples + held-out AUC > 0.75.

---

## Feature flag behaviour

`context.learnedRanker` (default `false`):
- **Off:** additive-weight selector runs (current behavior). Classifier runs in shadow mode — scores logged to telemetry but not used.
- **On:** classifier scores drive top-N selection. Shadow mode disabled.

`context.packetMode` (default `'full'`):
- **`'full'`:** current packet shape.
- **`'lean'`:** `<project_structure>` dropped, `<relevant_code>` capped at 6, rest preserved.

Additional per-session override via renderer (extend Phase G UI from Wave 30 as a model).

---

## Architecture notes

**Feature vector (Phase B):**
Must align with what `context-decisions.jsonl` records. Read `src/main/orchestration/contextOutcomeObserver*.ts` (Wave 29.5 Phase C output) for the current fields. Likely features (subject to what the decision log actually stores):
- `recencyScore` — normalized edit recency
- `pagerankScore` — graph centrality (wired in Wave 29.5 Phase D)
- `importDistance` — AST-derived closeness to dirty file
- `keywordOverlap` — token overlap with focus text
- `prevUsedCount` — same file used in prior turns this session
- `toolKindHint` — derived from imminent tool (read vs edit vs write) — categorical one-hot

All features normalized to [0, 1]. Logistic classifier: `z = Σ wᵢ · xᵢ + b`, `p = 1 / (1 + e⁻ᶻ)`.

**Training script (Phase A):**
- Mirror `tools/train-router.py` exactly in structure: argparse, join logic, scikit-learn LogisticRegression, train/test split (stratified, 80/20), held-out AUC computation, weight JSON output.
- Label derivation:
  - `used` = the row exists in `context-outcomes.jsonl` with `toolKind ∈ {read, edit, write}` within the turn window → label 1.
  - `unused` = included in packet but no matching outcome → label 0.
  - `missed` = synthetic negative: a candidate that was excluded but the agent later requested (e.g. tool-used a file not in the packet) → label 0 with `synthetic: true` column for diagnostics.
- Output file: `${userData}/context-retrained-weights.json` with shape:
  ```json
  { "version": "ISO-8601", "featureOrder": ["recencyScore", ...], "weights": [...], "bias": ...,
    "metrics": { "samples": N, "heldOutAuc": 0.xx, "trainedAt": "ISO-8601" } }
  ```

**Hot-swap (Phase C):**
- Use the same watchdog pattern as `router/retrainTrigger.ts`. Debounced trigger on every `context-outcomes.jsonl` append counter.
- On successful retrain, call `reloadContextWeights()`. Log `[context-ranker] weights reloaded version=<ISO> auc=<x>` — this is what Observability reads.
- If retrain fails (python missing, script errors, JSON invalid), log warn and keep current weights.

**Selector refactor (Phase D):**
- Extract all existing scoring math into `contextSelectorFeatures.ts` as pure `computeFeatures(candidate, ctx): FeatureVec`.
- `contextSelector.ts` top-N: if `context.learnedRanker === true`, use `classifier.score(features)` as the ranking key. Else, use existing additive function.
- Wave 24 reranker runs AFTER top-N in both branches.
- Shadow mode: when flag off, still call `classifier.score(features)` and record both scores to telemetry for offline AUC verification. Do not let the classifier call fail loudly — swallow, log once.

**Lean packet (Phase E):**
- `claudeCodeContextBuilder.ts` already composes the packet. Add a mode parameter. Lean branch:
  - Skip `<project_structure>` block emission.
  - Slice `<relevant_code>` to `Math.min(top.length, 6)`.
  - Keep everything else.
- Settings UI: radio "Context packet size — Full / Lean" in the existing AI Agents settings tab. Design-token only.
- Ideally both modes share PageRank repo map since Wave 29.5 Phase D wired pagerank_score into the feature vector; lean still benefits from structural signals.

**Dashboard (Phase F):**
- Extend `src/renderer/components/Observability/OrchestrationInspector.tsx`'s TABS array (same pattern as Wave 30 Phase H used). New sub-tab `'context-ranker'` → renders a card with weight version, last-retrain timestamp, last AUC, top 5 feature weights ± values, and a shadow-mode A/B comparison (when flag off).
- IPC: `context:getRankerDashboard` returns `{ version, trainedAt, auc, topFeatures: [{ name, weight }] }`.

---

## ESLint split points to anticipate

- `contextSelector.ts` — already likely near the 300-line limit. Extracting features to `contextSelectorFeatures.ts` is mandatory, not optional.
- `contextClassifier.ts` — score function stays pure, small. Defaults live in a separate data file so the module is just the math.
- `claudeCodeContextBuilder.ts` — already large. Lean-mode branch is a parameter passed to an existing composer; extract a `claudeCodeContextBuilderLean.ts` helper if the lean path grows.
- `contextRankerDashboardHandlers.ts` — aggregation can stay under 300; pattern mirrors Wave 30 Phase H's `researchDashboardHandlers.ts`.

---

## Risks

- **Insufficient samples at launch** — 1000-sample gate is a flip prerequisite, not a ship prerequisite. Ship code with flag off; flip only after samples accumulate.
- **Label noise** — tool-use doesn't always imply relevance (agents read files to verify, not because they're useful). Mitigation: `Edit` / `Write` get higher weight in label derivation than `Read`.
- **Overfitting to author's workflows** — held-out AUC gate (>0.75) + quarterly retrain review scheduled via dashboard freshness check.
- **Lean mode regresses complex multi-file tasks** — `full` stays available as per-session override; telemetry tracks `missed` rate.
- **Hot-swap races** — `reloadContextWeights()` is atomic (read new file, parse, replace reference). Selector reads the ref via closure; concurrent turns see either old or new, never corrupt state.

---

## Acceptance

- With ≥1000 labeled samples in the JSONL, `train-context.py` produces weights with held-out AUC > 0.75.
- Hot-swap log line `[context-ranker] weights reloaded version=... auc=...` fires on retrain.
- Old additive path still works when `context-retrained-weights.json` is absent (bundled defaults).
- Lean mode: `missed` rate across 20 recorded sessions < 5%.
- `npm test` green, `npm run lint` 0 errors, `npm run build` green.

---

## Soak gate

**Do not flip `context.learnedRanker` to `true` until:**
1. ≥ 2 weeks of samples accumulated since Phase D lands.
2. ≥ 1000 labeled samples in `context-outcomes.jsonl`.
3. Most-recent held-out AUC > 0.75.
4. Shadow-mode A/B telemetry shows classifier top-N overlaps ≥80% with additive top-N (high divergence means one is wrong).

**Do not flip `context.packetMode` to `'lean'` default until:**
1. 2 weeks of observation with half sessions manually set to lean.
2. Missed rate < 5%.
