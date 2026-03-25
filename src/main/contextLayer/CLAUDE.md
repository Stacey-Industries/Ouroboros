<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The three-stage pipeline (directory structure → barrel signals → import graph) implements progressively more expensive analysis — Option A is a pure tree walk, Option B scans imports O(files), and Option C builds a full resolved graph. The `maybeRunGraphAnalysis` threshold (≥10% dirty modules) enforces this cost gradient at refresh time.
`─────────────────────────────────────────────────`

# contextLayer — Repo-aware context enrichment for agent sessions

Builds three context layers (repo map, module summaries, dependency graph) from the repo indexer's data and injects them into context packets before they reach the LLM provider.

## Key Files

| File                              | Role                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextLayerController.ts`       | Main controller — indexes workspace, detects modules, caches summaries, enriches context packets. Singleton via `initContextLayer()` / `getContextLayerController()`.                        |
| `contextLayerControllerSupport.ts`| Module detection pipeline (Options A–C), import analysis, graph analysis application, repo map builder. Re-exports helpers from the two sibling files below it.                              |
| `contextLayerControllerHelpers.ts`| Low-level helpers: `buildDirTree`, `makeModule`, `isCodeFile`, `selectRepresentativeFiles`, `computeModuleHash`, `normalizePath`. Shared by controller and support.                          |
| `contextLayerRefresher.ts`        | Dirty-module refresh path — `updateModuleCache`, `refreshDirtyModuleCache`, `maybeRunGraphAnalysis`, fire-and-forget enrichment on refresh.                                                  |
| `contextLayerAiSummarizer.ts`     | Optional Haiku calls for natural-language module descriptions. Circuit-breaker after 3 failures. Persists summaries to `.ouroboros/module-summaries.json` in the workspace root.             |
| `contextLayerModuleSummary.ts`    | `buildSingleModuleSummary` + `selectModuleSummariesForGoal` — scores modules against goal keywords, boosting strong-boundary and high-cohesion modules.                                      |
| `languageStrategies.ts`           | Language-specific import extraction + resolution for 10 languages (TS/JS, Python, Java, Kotlin, Go in this file; Rust, C/C++, Ruby, PHP, C# in `languageStrategiesSupport.ts`).            |
| `languageStrategiesSupport.ts`    | Languages 6–10 strategy definitions. Companion to `languageStrategies.ts` — split to stay under the file-line limit.                                                                        |
| `importGraphAnalyzer.ts`          | "Option C" — builds resolved import graph, computes per-module cohesion, re-exports `refineModuleAssignments` from support.                                                                 |
| `importGraphAnalyzerSupport.ts`   | Seed-based iterative refinement — moves files to the module they import most. Runs until stable or 10 iterations.                                                                            |
| `contextLayerTypes.ts`            | `ContextLayerConfig` interface: `enabled`, `maxModules`, `maxSizeBytes`, `debounceMs`, `autoSummarize`, `moduleDepthLimit`.                                                                  |

## Architecture — Three-Stage Detection Pipeline

```
Option A: detectModules()           — directory tree walk (adaptive depth, default 6)
     ↓
Option B: applyImportAnalysis()     — barrel vs. direct import counting → boundary strength
     ↓
Option C: applyGraphAnalysis()      — resolved import graph → cohesion metrics + file movements
```

Each stage refines the module assignment output of the previous. Option C is gated at refresh time: only runs when ≥10% of modules are dirty (or ≥5 absolute).

## Key Patterns

- **Singleton controller**: `initContextLayer()` sets module-level `controller`. `getContextLayerController()` returns it. Nothing else should construct `ContextLayerControllerImpl` directly.
- **Caching + dirty tracking**: Module summaries are hashed from `filePath|size|modifiedAt`. Unchanged modules skip re-index. `dirtyModuleIds` is a `Set<string>` on `ModuleCacheState`.
- **Debounced file changes**: `onFileChange` buffers paths for 2 s before marking modules dirty. Prevents save-storm rebuilds.
- **Init cooldown**: 5-minute cooldown between full re-indexes. Prevents `initialize()` on startup and `onSessionStart()` from double-firing.
- **AI enrichment**: Fire-and-forget — never blocks `enrichPacket`. Uses `claude-haiku-4-5-20251001` at concurrency 3. Persisted to `<workspaceRoot>/.ouroboros/module-summaries.json`; reloaded on next init via `stateHash` comparison.
- **maxModules hard cap**: `enrichPacket` clamps `config.maxModules` to 12 before calling `selectModuleSummariesForGoal`.

## Dependencies

- **Upstream**: `../orchestration/repoIndexer` (`RepoIndexSnapshot`, `IndexedRepoFile`), `../orchestration/types` (`ContextPacket`, `ModuleContextSummary`, `RepoMapSummary`)
- **Downstream consumers**: `../orchestration/providers/claudeCodeAdapter` calls `enrichPacket` before sending to the provider
- **Side effects on events**: On file change and git commit, dynamically imports and calls `clearContextPacketCache()` from `contextPacketBuilder` and `invalidateSnapshotCache()` from `contextSelectionSupport`

## Gotchas

- **`isCodeFile` is duplicated**: `contextLayerControllerHelpers.ts` uses array `.includes`; `importGraphAnalyzer.ts` uses `Set.has`. Keep extension lists in sync when adding languages.
- **`resolveRelativeImport` is duplicated**: Identical logic exists independently in `contextLayerControllerSupport.ts` and `languageStrategies.ts`. Do not consolidate without checking test coverage — each is tested separately.
- **Path alias loading must precede graph analysis**: `configureTypeScriptAliases` in `languageStrategies.ts` mutates module-level alias state. Call `loadPathAliases()` before `buildResolvedImportGraph()` or TS path aliases (e.g. `@renderer/*`) won't resolve.
- **File splits follow the `max-lines: 300` ESLint rule**: Controller → Support → Helpers → Refresher is a deliberate 4-way split, not a layering decision. Don't merge them.
- **Dynamic imports for cache invalidation**: `contextPacketBuilder` and `contextSelectionSupport` are loaded via `import()` inside event handlers to avoid circular dependencies with the orchestration layer.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# contextLayer — Repo-aware context enrichment for agent sessions

Builds three context layers (repo map, module summaries, dependency graph) from the repo indexer's data and injects them into context packets before they reach the LLM provider.

## Key Files

| File                        | Role                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextLayerController.ts` | Main controller — indexes workspace, detects modules from directory structure, caches summaries, enriches context packets. Singleton via `initContextLayer()` / `getContextLayerController()`. |
| `languageStrategies.ts`     | Language-specific import extraction + resolution for 10 languages (TS/JS, Python, Java, Kotlin, Go, Rust, C/C++, Ruby, PHP, C#). Self-contained — no project imports.                          |
| `importGraphAnalyzer.ts`    | "Option C" — builds resolved import graph, computes module cohesion metrics, and iteratively refines module boundaries via seed-based clustering.                                              |
| `contextLayerTypes.ts`      | Config interface (`ContextLayerConfig`): enabled, maxModules, maxSizeBytes, debounceMs, autoSummarize, moduleDepthLimit.                                                                       |

## Architecture

Three-stage module detection pipeline:

1. **Option A** — Directory structure walk (`detectModules` → `collectModulesFromTree`). Adaptive depth, not fixed — leaf dirs with code files become modules.
2. **Option B** — Barrel/import signal analysis (`applyImportAnalysis`). Counts barrel vs. direct imports per module, derives boundary strength (strong/moderate/weak).
3. **Option C** — Import graph refinement (`applyGraphAnalysis` via `importGraphAnalyzer`). Resolves actual imports, measures cohesion, moves misplaced files to better-fitting modules.

## Key Patterns

- **Caching**: Module summaries are hashed by `filePath|size|modifiedAt`. Unchanged modules are skipped on re-index. Dirty modules tracked via `dirtyModuleIds` set.
- **Debounced file changes**: `onFileChange` buffers paths for 2s before processing. Prevents rapid-fire rebuilds on save storms.
- **Init cooldown**: 5-minute cooldown between full re-indexes. Prevents startup init + `session_start` hook from double-indexing.
- **AI enrichment**: Optional Haiku calls to generate natural-language module descriptions. Fire-and-forget (doesn't block `enrichPacket`). Circuit-breaker after 3 consecutive failures. Persisted to `.ouroboros/module-summaries.json`.
- **Goal-based selection**: `selectModuleSummariesForGoal` scores modules against goal keywords, boosting strong-boundary and high-cohesion modules.

## Dependencies

- **Upstream**: `../orchestration/repoIndexer` (provides `RepoIndexSnapshot`, `IndexedRepoFile`), `../orchestration/types` (provides `ContextPacket`, `ModuleContextSummary`, `RepoMapSummary`)
- **Downstream consumers**: `../orchestration/providers/claudeCodeAdapter` (calls `enrichPacket` before sending to provider)
- **Side effects on events**: Clears `contextPacketBuilder` and `contextSelectionSupport` caches on file change / git commit

## Gotchas

- **`isCodeFile` is duplicated** in both `contextLayerController.ts` and `importGraphAnalyzer.ts` (array `.includes` vs `Set.has`). Keep them in sync if adding languages.
- **`resolveRelativeImport` is duplicated** across controller and analyzer — each has its own copy with identical logic.
- **Path alias loading**: `configureTypeScriptAliases` mutates module-level state in `languageStrategies.ts`. Must be called before `buildResolvedImportGraph` or aliased imports won't resolve.
- **Graph analysis is expensive**: Only runs on refresh when ≥10% of modules are dirty (or ≥5 absolute). For small incremental edits, only barrel/import analysis runs.
- **Module depth limit default is 6**: Configurable via `ContextLayerConfig.moduleDepthLimit`. Directories deeper than this get absorbed into a single module.
