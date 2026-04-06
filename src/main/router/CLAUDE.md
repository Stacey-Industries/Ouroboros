<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The retrain pipeline is a closed self-improvement loop running entirely within the Electron process: collect signals → export → spawn Python → validate → hot-reload. This avoids any external training infrastructure, but means the ML model quality is bounded by however much real usage accumulates. The 50-sample threshold in `DEFAULT_MIN_SAMPLES` is a tuning knob — too low and you get noisy retrains, too high and improvements lag behind usage patterns.
`─────────────────────────────────────────────────`

Generated `src/main/router/CLAUDE.md`. Key things captured:

- **Three-layer cascade architecture** with latencies and fallback behavior
- **`FEATURE_NAMES` ordering constraint** — the most dangerous silent failure mode (TS + Python must stay in sync)
- **Shadow routing vs active routing** distinction — easy to conflate
- **Layer 3 not wired** into the sync path (architectural debt worth knowing)
- **Hot-reload mechanism** and startup weight resolution order
- **Full data flow** from prompt → training pipeline → weight swap
- Security lint workarounds (`.at(i)` pattern) so future editors don't "clean them up"
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# `src/main/router/` — Model Tier Router

Three-layer cascade that selects HAIKU / SONNET / OPUS for each chat prompt. Also shadow-routes terminal prompts for passive training data collection and auto-retrains the ML classifier from accumulated quality signals.

## Architecture: Three-Layer Cascade

```
Layer 1 — ruleEngine.ts       (sync, 0ms)   deterministic pattern matching
Layer 2 — classifier.ts       (sync, ~5ms)  logistic regression (bundled weights)
Layer 3 — llmFallback.ts      (async, ~300ms) Haiku API call, in-memory cache

Each layer yields to the next when confidence is below threshold.
Falls back to SONNET on any error or complete miss.
```

## File Map

| File | Role |
|------|------|
| `orchestrator.ts` | Entry point — chains all three layers; `routePromptSync()` is the main call site |
| `routerTypes.ts` | **Single source of truth** — all types, `ModelTier`, `TIER_TO_MODEL`, `SLASH_COMMAND_TIERS`, `FEATURE_NAMES` |
| `ruleEngine.ts` | Layer 1 — deterministic rules: slash commands, keyword patterns, follow-up confirmation detection |
| `featureExtractor.ts` | Extracts the 19 numeric features consumed by Layer 2 |
| `classifier.ts` | Layer 2 — pure-TS logistic regression; loads weights from `model/router-weights.json` |
| `llmFallback.ts` | Layer 3 — async Haiku API call; 2s timeout, 5-minute in-memory cache |
| `routerFeedback.ts` | Builds `EnrichedRoutingLogEntry` with trace ID, counterfactuals, workspace hash |
| `routerLogger.ts` | Appends enriched entries to `{userData}/router-decisions.jsonl` |
| `qualitySignalCollector.ts` | Tracks implicit quality signals (regeneration, abort, git commit) → `router-quality-signals.jsonl` |
| `qualitySignalTypes.ts` | `QualityAnnotation` type — shape of quality signal entries |
| `routerShadow.ts` | Shadow-routes terminal `user_prompt_submit` hook events for training data (never changes model) |
| `retrainTrigger.ts` | Polls signal count; when ≥50 new samples, exports data + spawns `tools/train-router.py` |
| `routerExporter.ts` | Merges decisions + signals by `traceId` → `router-full-extracted.jsonl` / `router-full-judged.jsonl` |
| `llmJudge.ts` | Sampled async judge — scores routing quality via Haiku; controlled by `llmJudgeSampleRate` |
| `index.ts` | Barrel re-export — only import from here, not from individual files |

Helper modules (`routerExporterHelpers.ts`, `retrainTriggerHelpers.ts`, `qualitySignalCollectorHelpers.ts`) exist purely to keep their parent under 300 lines.

## Key Patterns

**`FEATURE_NAMES` is a shared contract.** The ordered array in `routerTypes.ts` is consumed by both the TS classifier and `tools/train-router.py`. Reordering or adding features without updating both breaks inference silently — the model will score features against the wrong weights.

**Slash command tiers are the highest priority.** `matchSlashCommand()` runs first in Layer 1. Adding a new command is a one-line entry in `SLASH_COMMAND_TIERS` in `routerTypes.ts`.

**Shadow routing vs active routing.** `routerShadow.ts` is called from `hooks.ts` on every `user_prompt_submit` event — it logs a decision but never feeds it back to the terminal session. This is training data collection only. Active routing happens in `orchestrator.ts`, called by the agent chat bridge.

**Classifier weights are hot-reloadable.** `classifier.ts` holds weights in a module-level variable. `reloadWeights(filePath)` swaps them atomically. At startup, `loadRetrainedWeightsIfAvailable()` checks `{userData}/router-retrained-weights.json` and loads it over the bundled defaults if present.

**Quality signal collector has bounded module state.** `chatHistory` map and `pendingAnnotations` array cap at 10K entries; entries older than 10 minutes are evicted on each flush. Don't introduce unbounded state here.

## Gotchas

- **Logistic regression uses `.at(i)` not `[i]`** throughout `classifier.ts` to satisfy `eslint-plugin-security`'s `detect-object-injection` rule. Don't simplify these to bracket access.
- **Layer 3 (LLM fallback) is not wired into `routePromptSync()`** — it's implemented but the orchestrator's sync path has no async escape hatch. It exists for future async routing or manual invocation.
- **`routerLastRetrainCount` is persisted to electron-store** via `config.ts`. After a retrain, the signal baseline is saved so subsequent checks measure *new* signals only.
- **Trainer script resolves from two locations**: dev (`app.getAppPath()/tools/train-router.py`) and packaged (`process.resourcesPath/train-router.py`). Only the dev path exists in the repo.
- **`llmFallback.ts` calls `createAnthropicClient()`** from `orchestration/providers/anthropicAuth` — requires valid auth. Falls back to `SONNET` silently on any error including auth failure.
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
