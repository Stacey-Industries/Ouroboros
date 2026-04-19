# Context Injection

## Overview

"Context injection" refers to the process by which Ouroboros assembles a structured **context packet** and prepares it for the agent on each turn. Every time a task is dispatched — whether via AgentChat, a background job, or the session dispatch queue — the orchestration layer selects the files, snippets, repo facts, and structural signals most relevant to the current task, packages them according to a token budget, and makes them available to the provider (Claude Code CLI, or future providers). The agent never touches the file system directly for context; it receives exactly what the pipeline decided to include.

This document covers the v3 pipeline as it exists after Waves 15–31. The pipeline lives in `src/main/orchestration/`.

---

## Pipeline Stages (v3 — Current)

### Stage 1 — Candidate Gathering

**File:** `src/main/orchestration/contextSelector.ts`

Entry point: `selectContextFiles(options)`. Candidate gathering assembles the initial set of files that *could* be included in the context packet. Inputs come from three sources:

- **Explicit selection** — `user_selected` (explicitly chosen for this task), `pinned` (persistent pins), `included` (request-level inclusions), `excluded` (block list).
- **Live IDE state** (`collectLiveIdeState` from `contextSelectionSupport.ts`) — `dirty_buffer` (unsaved changes), `activeFile`, `openFiles`. The IDE tool socket (`\\.\pipe\ouroboros-tools`) is queried for in-memory buffer contents; falls back to disk reads.
- **Repo facts** (`RepoFacts` from `repoIndexer.ts`) — `recent_edit` / `recent_user_edit` / `recent_agent_edit`, `git_diff`, `diagnostic` (files with LSP errors/warnings), workspace entry points (`dependency`), and keyword matches (`keyword_match`). Import-adjacent files are discovered via `findRelatedSeeds` from snapshot content.

After gathering, test companions (`*.test.ts`, `*.spec.ts` siblings) are added, and PageRank scores are computed if the codebase graph is warm.

---

### Stage 2 — Feature Extraction

**File:** `src/main/orchestration/contextSelectorFeatures.ts`

After candidate gathering (Stage 1), the learned-ranker path (Stage 3b) requires a feature vector per candidate. `computeFeatures(candidate, ctx)` produces the following 9 features, all normalized to `[0, 1]`:

| Feature | Derivation |
|---|---|
| `recencyScore` | Max weight across `recent_user_edit` / `recent_edit` / `recent_agent_edit` reasons, divided by 32 (max weight for that class). |
| `pagerankScore` | `candidate.pagerank_score` normalized by the max PageRank score across all candidates this cycle. |
| `importDistance` | 1.0 if `import_adjacency` reason present; 0.5 if `dependency` only; 0.0 otherwise. |
| `keywordOverlap` | Keyword hit count recovered from `keyword_match` reason weight, normalized by max hit count this cycle. |
| `prevUsedCount` | `candidate.reasons.length / 8` — more reasons approximates more prior usage (saturates at 8). |
| `toolKindHint_read` | 1 if `request.mode === 'review'`, else 0. One-hot. |
| `toolKindHint_edit` | 1 if `request.mode === 'edit'`, else 0. One-hot. |
| `toolKindHint_write` | Always 0 in current routing (reserved for future write-heavy modes). |
| `toolKindHint_other` | 1 if none of the above. |

`buildFeatureCtx(request, candidates)` pre-computes the normalization denominators (`maxPagerankScore`, `maxKeywordHits`, `maxAdditiveScore`) in a single pass over the candidate map.

**The feature order is a contract.** `contextClassifierDefaults.ts` declares `featureOrder` as a frozen array; `computeFeatures` must produce keys in that exact order. A test in `contextSelectorFeatures.test.ts` asserts this.

---

### Stage 3 — Scoring

There are two scoring paths. They run sequentially — the additive path always runs; the classifier path is additive or override depending on the feature flag.

#### 3a — Additive (historical, always active)

**File:** `src/main/orchestration/contextSelector.ts` — `REASON_WEIGHTS` table, `addReason` calls

Each reason kind has a static weight. When a candidate receives a reason, its score accumulates `weight`. The final additive score is the sum of all reason weights. Key weights:

| Reason | Weight | Notes |
|---|---|---|
| `user_selected` | 100 | Explicit task selection |
| `pinned` | 95 | Persistent context pin |
| `included` | 85 | Request-level inclusion |
| `dirty_buffer` | 68 | Unsaved editor changes |
| `git_diff` (user-authored) | 56 | In current diff, not agent-authored |
| `git_diff` (agent-authored) | 12 (`AGENT_DIFF_WEIGHT`) | Agent diff is down-weighted |
| `diagnostic` | 52 | Has LSP errors/warnings |
| `test_companion` | 38 | Sibling test file |
| `recent_user_edit` | 32 | User edited, provenance confirmed |
| `keyword_match` | 26+ | Goal text matches (additive per hit) |
| `import_adjacency` | 22+ | Imports/imported-by a seed file |
| `dependency` | 12 | Workspace entry point |
| `pagerank` | dynamic (score × 40) | Graph-based structural relevance |
| `recent_agent_edit` | 4 | Agent-authored recent edit |

The additive score is used for confidence classification and tier assignment (see Stage 4), and as the ranking key when `context.learnedRanker === false`.

Per-Phase A audit: `REASON_WEIGHTS` cannot be deleted — it feeds initial candidate scores used by confidence, tier, and the additive ranking path unconditionally.

#### 3b — Learned Ranker (Wave 31, data-gated)

**Files:** `src/main/orchestration/contextClassifier.ts`, `contextSelectorRanker.ts`

When `config.context.learnedRanker === true`, `classifierRankCandidates(candidates, request)` replaces the additive sort order. It:

1. Calls `buildFeatureCtx` to compute normalization denominators.
2. Calls `computeFeatures(candidate, ctx)` for each candidate.
3. Scores each feature vector via `contextClassifier.score(features)` — a logistic regression sigmoid: `σ(bias + Σ wᵢ × fᵢ)`.
4. Sorts candidates by descending classifier probability.

When `context.learnedRanker === false` (default), shadow mode runs: `runShadowMode(additiveRanked, candidates, request)` computes classifier scores in parallel with the additive path and logs overlap statistics (`[context-ranker] shadow {additiveTopN, classifierTopN, overlap}`) without affecting the returned order. Shadow errors are suppressed after the first occurrence per process lifetime (`shadowErrorLogged` guard).

**Active weights:** `contextClassifier.ts` holds `activeWeights` (module-level). Starts as `BUNDLED_CONTEXT_WEIGHTS` from `contextClassifierDefaults.ts`. Hot-swapped at runtime via `reloadContextWeights(filePath?)`.

---

### Stage 4 — Tier Classification

**File:** `src/main/orchestration/contextPacketBuilderSupport.ts` — `getFileTier`, `TIER1_REASONS`, `TIER2_REASONS`

After ranking, each file is assigned to a budget tier based on its top-weight reason:

| Tier | Reasons | Budget guarantee |
|---|---|---|
| 1 | `user_selected`, `pinned` | Up to 60% of total bytes |
| 2 | `dirty_buffer`, `git_diff` | At least 25% of total bytes |
| 3 | All other reasons | Remaining budget |

Confidence is separately assigned by `contextSelectorHelpers.ts::confidenceFor()`: `high` if user-selected, pinned, dirty, score ≥ 80, or diagnostic/diff; `medium` if score ≥ 35 or ≥ 2 reasons; otherwise `low`.

---

### Stage 5 — Haiku Reranker (Wave 24)

**Files:** `src/main/orchestration/contextReranker.ts`, `contextRerankerSpawn.ts`

After the top-N files are selected (either additive or learned ranker), `rerankRankedFiles(goal, files)` runs if `config.context.rerankerEnabled !== false`. It:

1. Skips if candidate count < 15 (`RERANK_THRESHOLD`).
2. Builds a prompt with up to 200-char snippet previews per file.
3. Spawns `claude --model haiku --print` with a 500ms timeout (`DEFAULT_TIMEOUT_MS`).
4. Parses `{"order": [...]}` from the CLI output.
5. Reorders files using `applyOrder` — ranked paths first (in the returned order), unranked paths after.

All failure paths (timeout, parse error, too few candidates) return the original order unchanged. The reranker has no local fallback; it requires a Haiku CLI invocation. There is currently no offline/embedded alternative.

---

### Stage 6 — Budget Enforcement

**Files:** `src/main/orchestration/contextPacketBuilderSupport.ts`, `contextPacketBuilder.ts`

`getModelBudgets(model)` returns a `ContextBudgetProfile`:

| Model | maxFiles | maxBytes | maxTokens |
|---|---|---|---|
| Opus | 20 | 128 KB | 32K tokens |
| Sonnet | 14 | 72 KB | 18K tokens |
| Default | 10 | 48 KB | 12K tokens |

Snippets are accepted greedily in tier order until the byte + token budget is exhausted. A file that exceeds its allocation is truncated via `truncateToSignatures` (70% head / 30% tail). Overlapping snippet ranges are deduplicated. Budget summary (estimated bytes, tokens, drop notes) is included in the final packet.

---

### Stage 7 — Lean Packet Mode (Wave 31)

**File:** `src/main/orchestration/claudeCodeContextBuilder.ts` (and config gating)

When `config.context.packetMode === 'lean'` (default `'full'`):

- `<project_structure>` section is **dropped entirely**.
- `<relevant_code>` is **capped at 6 files** (versus the full budget-limited set).
- All other sections — `workspace_state`, `current_focus`, `diagnostics`, `terminal`, PageRank structural summary, memories, skills, `system_instructions` — are preserved.

The lean mode is exposed as a radio toggle in Settings under AI Agents. Default is `'full'`. The soak gate for flipping the default is: 2 weeks of observation with half of sessions manually set to lean, and `missed` rate < 5%.

---

### Stage 8 — Decision Logging

**Files:** `src/main/orchestration/contextDecisionWriter.ts`, `contextOutcomeWriter.ts`

Every packet build records a `ContextDecision` to `context-decisions-YYYY-MM-DD.jsonl` in `userData`. Every session outcome (files-used, tool-kinds, task-success signal) records a `ContextOutcome` to `context-outcomes-YYYY-MM-DD.jsonl`. Both writers are async-batched (50ms flush interval), with 10 MB intraday size rotation and 30-day retention enforced at startup.

These files are the training dataset for the retrain loop (see below).

---

## Feature Flags Governing the Pipeline

| Flag | Config key | Default | Effect |
|---|---|---|---|
| Learned ranker | `context.learnedRanker` | `false` | `false`: additive sort + shadow-mode classifier logging. `true`: classifier score is the ranking key. |
| Packet mode | `context.packetMode` | `'full'` | `'full'`: full snippet budget. `'lean'`: drop project_structure, cap relevant_code to 6. |
| Reranker | `context.rerankerEnabled` | `false` | `false`: skip Haiku reranker entirely. Opt-in via config (cold-start ~1–3s). |

**Soak gate for `context.learnedRanker → true`:** ≥ 2 weeks of samples since Phase D (2026-04-17), ≥ 1000 labeled outcomes in `context-outcomes.jsonl`, most-recent held-out AUC > 0.75, shadow-mode overlap ≥ 80%.

---

## Retrain Loop

```
context-decisions-*.jsonl   ─┐
                              ├─► tools/train-context.py
context-outcomes-*.jsonl    ─┘       │
                                     │  scikit-learn LogisticRegression
                                     │  stratified 80/20 split, roc_auc_score
                                     ▼
                              context-retrained-weights.json
                                     │
                                     ▼
                    contextRetrainTrigger.ts (fs.watch)
                       └─► reloadContextWeights()
                              (hot-swaps activeWeights in contextClassifier.ts)
```

**Trigger:** `contextRetrainTrigger.ts` watches `context-outcomes.jsonl` via `fs.watch`. When ≥ 200 new rows have accumulated since the last run and the 5-minute cooldown has elapsed, it spawns `tools/train-context.py` via the system Python binary (autodetected by `findPython()`). The script outputs a `trained samples=N auc=X.XX version=...` summary line on success.

**Hot-swap:** `reloadContextWeights(filePath)` in `contextClassifier.ts` reads and validates `context-retrained-weights.json`, replacing `activeWeights` in-process. Schema validation checks feature order length, all weights finite, metrics shape. On any failure, current weights are preserved and the reason is logged.

**Wiring:** `startContextRetrainTrigger` is the public API; it should be called from `src/main/mainStartup.ts` with paths from `app.getPath('userData')`. All paths are passed explicitly — no Electron imports inside the module — making it fully testable.

---

## Observability

The Orchestration Inspector (accessible from the right sidebar in AgentMonitor view) has a "Context Ranker" tab that exposes:

- **Weight version** — version string from the active `ContextRankerWeights`.
- **Last-retrain timestamp** — `metrics.trainedAt`.
- **Held-out AUC** — `metrics.heldOutAuc`.
- **Top 5 feature weights** — rendered as color-coded ±weight bars (positive = green, negative = red).
- **Sample / class balance** — `metrics.samples`, `metrics.classBalance.pos/neg`.

IPC: `context:getRankerDashboard` → `{ version, trainedAt, auc, topFeatures: Array<{name, weight}> }`.
Renderer: `src/renderer/components/Orchestration/ContextRankerCard.tsx`.

---

## Evolution History

| Version | Description | Wave |
|---|---|---|
| v1 | Hand-tuned additive weight table. Fixed weights per reason kind, no provenance distinction. | Wave 15 baseline |
| v2 | PageRank integration. Provenance-aware weights (`recent_user_edit` vs `recent_agent_edit`). Agent-diff down-weighting (`AGENT_DIFF_WEIGHT = 12`). PageRank seeds from pinned/keyword/user-edit candidates. | Wave 19 |
| v3 | Learned logistic classifier. Feature extraction layer (`contextSelectorFeatures.ts`). Shadow mode for data-gated rollout. Haiku reranker for top-N reordering. Lean packet mode. Decision/outcome JSONL logging feeding an offline retrain loop. | Wave 24 (reranker), Wave 31 (classifier + lean mode) |

---

## Current Limitations

- **Syntax-highlighting theme import** (`docs/theming.md`) is not context-aware — it processes VS Code `colors` fields into Ouroboros tokens independently of the context pipeline.
- **Haiku reranker has no local fallback.** When the Claude CLI is unavailable (offline, rate-limited, auth error), the reranker silently passes through the original order. There is no embedded alternative.
- **Feature extraction is approximation-based.** `prevUsedCount` uses `reasons.length` as a proxy for prior usage frequency rather than tracking actual historical inclusion counts across sessions.
- **Shadow-mode overlap logging is one-way.** The classifier compares its top-N against the additive top-N at selection time, but the outcome writer does not attribute which ranking path caused which outcome. AUC validation is offline-only.
- **`contextWorker.ts`** (proactive 30s background refresh) and **`contextWorkerTypes.ts`** are not currently integrated into the main startup sequence — they were flagged as unused by knip (Phase H). The worker is implemented but not wired.
