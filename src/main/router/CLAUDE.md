<!-- claude-md-auto:start -->

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# `src/main/router/` — Model Tier Router

Three-layer cascade that selects HAIKU / SONNET / OPUS for each chat prompt. Also shadow-routes terminal prompts for passive training data collection. The auto-retrain pipeline is **disabled by default** as of Wave 61 — see "Wave 61: maintenance-only mode" below.

## Wave 61: maintenance-only mode

`routerSettings.autoRetrainEnabled` defaults to `false`. The periodic retrain observer (`observeDatasetGrowth`) short-circuits when the flag is off; signal/decision logging continues normally. Reason: `routerExporterHelpers.signalToLabel` only produces _reinforce-current-tier_ and _escalate-one-step_ labels — there is no de-escalation path. For users who don't actively try cheaper tiers, the label distribution is degenerate (e.g. all-OPUS) and the trainer's per-class minimum (`MIN_PER_CLASS_SAMPLES = 5` in `tools/train-router.py`) is never reached. Pre-Wave-61 the loop fired every 30s indefinitely without progress.

The active model-selection feature is now Wave 61's **delegation coach** at `src/main/delegationCoach/`. The router stays in place serving bundled weights for any consumer that calls `routePromptSync()`; flip `autoRetrainEnabled: true` only if you have a tier-balanced label distribution OR want to re-enable retraining for experimentation.

An LLM judge (sampled async scorer for routing quality) was scoped but never shipped — it would be the missing piece for de-escalation labels. Defer until there's a concrete need; the delegation coach addresses the user-facing pain that originally motivated it. The `llmJudgeSampleRate` config field was removed in 2026-05.

## Architecture: Two-Layer Cascade (Layer 3 unwired)

```
Layer 1 — ruleEngine.ts       (sync, 0ms)   deterministic pattern matching
Layer 2 — classifier.ts       (sync, ~5ms)  logistic regression (bundled weights)
Layer 3 — (unimplemented)     placeholder for future async LLM fallback

Each layer yields to the next when confidence is below threshold.
When both Layer 1 and Layer 2 decline, routePromptSync returns null
and the caller falls back to SONNET.
```

## File Map

| File                        | Role                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `orchestrator.ts`           | Entry point — chains all three layers; `routePromptSync()` is the main call site                             |
| `routerTypes.ts`            | **Single source of truth** — all types, `ModelTier`, `TIER_TO_MODEL`, `SLASH_COMMAND_TIERS`, `FEATURE_NAMES` |
| `ruleEngine.ts`             | Layer 1 — deterministic rules: slash commands, keyword patterns, follow-up confirmation detection            |
| `featureExtractor.ts`       | Extracts the 19 numeric features consumed by Layer 2                                                         |
| `classifier.ts`             | Layer 2 — pure-TS logistic regression; loads weights from `model/router-weights.json`                        |
| `routerFeedback.ts`         | Builds `EnrichedRoutingLogEntry` with trace ID, counterfactuals, workspace hash                              |
| `routerLogger.ts`           | Appends enriched entries to `{userData}/router-decisions.jsonl`                                              |
| `qualitySignalCollector.ts` | Tracks implicit quality signals (regeneration, abort, git commit) → `router-quality-signals.jsonl`           |
| `qualitySignalTypes.ts`     | `QualityAnnotation` type — shape of quality signal entries                                                   |
| `routerShadow.ts`           | Shadow-routes terminal `user_prompt_submit` hook events for training data (never changes model)              |
| `retrainTrigger.ts`         | Polls signal count; when ≥50 new samples, exports data + spawns `tools/train-router.py`                      |
| `routerExporter.ts`         | Merges decisions + signals by `traceId` → `router-full-extracted.jsonl` / `router-full-judged.jsonl`         |
| `index.ts`                  | Barrel re-export — only import from here, not from individual files                                          |

Helper modules (`routerExporterHelpers.ts`, `retrainTriggerHelpers.ts`, `qualitySignalCollectorHelpers.ts`) exist purely to keep their parent under 300 lines.

## Key Patterns

**`FEATURE_NAMES` is a shared contract.** The ordered array in `routerTypes.ts` is consumed by both the TS classifier and `tools/train-router.py`. Reordering or adding features without updating both breaks inference silently — the model will score features against the wrong weights.

**Slash command tiers are the highest priority.** `matchSlashCommand()` runs first in Layer 1. Adding a new command is a one-line entry in `SLASH_COMMAND_TIERS` in `routerTypes.ts`.

**Shadow routing vs active routing.** `routerShadow.ts` is called from `hooks.ts` on every `user_prompt_submit` event — it logs a decision but never feeds it back to the terminal session. This is training data collection only. Active routing happens in `orchestrator.ts`, called by the agent chat bridge.

**Classifier weights are hot-reloadable.** `classifier.ts` holds weights in a module-level variable. `reloadWeights(filePath)` swaps them atomically. At startup, `loadRetrainedWeightsIfAvailable()` checks `{userData}/router-retrained-weights.json` and loads it over the bundled defaults if present.

**Quality signal collector has bounded module state.** `chatHistory` map and `pendingAnnotations` array cap at 10K entries; entries older than 10 minutes are evicted on each flush. Don't introduce unbounded state here.

## Gotchas

- **Logistic regression uses `.at(i)` not `[i]`** throughout `classifier.ts` to satisfy `eslint-plugin-security`'s `detect-object-injection` rule. Don't simplify these to bracket access.
- **Layer 3 (LLM fallback) is unimplemented.** `routePromptSync()` returns null when both Layer 1 and Layer 2 decline; the orchestrator has no async escape hatch. The `llmFallback.ts` and `llmJudge.ts` files referenced in older docs were never shipped — see Wave 61 maintenance-only mode above.
- **`routerLastRetrainCount` is persisted to electron-store** via `config.ts`. After a retrain, the signal baseline is saved so subsequent checks measure _new_ signals only.
- **Trainer script resolves from two locations**: dev (`app.getAppPath()/tools/train-router.py`) and packaged (`process.resourcesPath/train-router.py`). Only the dev path exists in the repo.
- **`workspaceRootHash`** in enriched log entries is a SHA-256 prefix of the workspace path, not the path itself — for privacy. Don't log raw paths.

## Data Flow (Training Pipeline)

```
chat prompt → routePromptSync() → logRoutingDecision() → router-decisions.jsonl
terminal hook → shadowRouteHookEvent() → logger.log() → router-decisions.jsonl

model outcome → qualitySignalCollector → router-quality-signals.jsonl

retrainTrigger (every 30s) → exportTrainingData() joins by traceId
                           → spawnTrainer() runs train-router.py
                           → reloadWeights() hot-swaps classifier
```

## Dependencies

- **Called by**: `agentChat/` bridge (active routing), `hooks.ts` (shadow routing via `routerShadow`)
- **Calls into**: `orchestration/providers/anthropicAuth` (Layer 3), `config.ts` (settings + retrain counter), `logger.ts`
- **Writes to**: `{app.userData}/router-decisions.jsonl`, `router-quality-signals.jsonl`, `router-full-*.jsonl`, `router-retrained-weights.json`
