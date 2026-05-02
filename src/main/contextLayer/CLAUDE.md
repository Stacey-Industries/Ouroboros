<!-- claude-md-auto:start -->
# contextLayer — Repo-aware context enrichment for agent sessions

Builds the repo map, module summaries, and cross-module deps that get injected into context packets before they reach the LLM provider. **Wave 67–69 made this subsystem a graph consumer**: signatures, hotspot ranking, and dependency edges come from the codebase-memory graph rather than file-walk heuristics. The contextLayer's load-bearing original contributions — directory-driven module identity, goal-conditioned selection, AI summarization — remain.

## Key Files

| File                              | Role                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextLayerController.ts`       | Main controller — indexes workspace, detects modules, caches summaries, enriches context packets. Singleton via `initContextLayer()` / `getContextLayerController()`.        |
| `contextLayerControllerSupport.ts`| Directory-walk module detection and the file-walk `RepoMapSummary` builder. Wave 69 Phase D removed import analysis + graph analysis seams.                                  |
| `contextLayerControllerHelpers.ts`| Low-level helpers: `buildDirTree`, `makeModule`, `isCodeFile`, `selectRepresentativeFiles`, `computeModuleHash`, `normalizePath`.                                             |
| `contextLayerRefresher.ts`        | Dirty-module refresh — hash-based caching only post-Wave-69.                                                                                                                  |
| `moduleSummarizer.ts`             | Optional Haiku calls for natural-language module descriptions. Circuit-breaker after 3 failures. Persisted to `<workspaceRoot>/.ouroboros/module-summaries.json`.             |
| `contextLayerModuleSummary.ts`    | `buildSingleModuleSummary` + `selectModuleSummariesForGoal` — goal-conditioned ranking of cached summaries.                                                                   |
| `repoMapGenerator.ts`             | Async repo-map builder. Plumbs graph-backed exports + hotspot ranking + cross-module deps. Soft-fallback when graph isn't ready.                                              |
| `repoMapGeneratorGraph.ts`        | Per-module Cypher: `MATCH (n) WHERE file_path STARTS WITH '<rootPath>' AND labels(n) IN ['Class','Function','Method'] RETURN n.name, n.signature, labels(n) AS kind LIMIT 50` |
| `repoMapGeneratorRanking.ts`      | Per-module hotspot scores via `MATCH ()-[r:CALLS]->(callee) … COUNT(*)`. Comparator with file-count tiebreaker.                                                              |
| `repoMapGeneratorDeps.ts`         | Per-source-module CALLS+IMPORTS edge enumeration → cross-module deps. Soft-fallback to file-walk via `moduleDetectorHelpers.buildCrossModuleDependencies`.                   |
| `repoMapGeneratorFrameworks.ts`   | Framework detection by config-file presence + extension counts.                                                                                                              |
| `repoMapBudgets.ts`               | Model-aware budget table: Opus 16 KB / 4K, Sonnet 12 KB / 3K, default 8 KB / 2K.                                                                                              |
| `moduleDetector*.ts` family       | Directory-driven module identity (Wave 69 Decision 1). Pattern matching + import resolution for the file-walk soft-fallback.                                                  |
| `contextLayerTypes.ts`            | `ContextLayerConfig`, `ModuleStructuralSummary`, `RepoMap`. Re-exports `ModuleExport` / `ModuleContextSummary` / `RepoMapSummary` from `orchestration/types`.                  |

## Architecture — Module Detection

```
detectModules()                          directory tree walk (adaptive depth, default 6)
   │
   ▼
buildModuleStructuralSummaries()         per-module file count + language stats + git diff
   │
   ▼
queryModuleExports()                     graph: signatures + kind (LIMIT 50 per module)
   │   soft-fallback: file-walk names with signature: null
   ▼
computeAllModuleHotspotScores()          graph: per-module COUNT(*) of inbound CALLS edges
   │
   ▼
buildCrossModuleDependenciesFromGraph()  graph: CALLS + IMPORTS edges aggregated to module pairs
   │   soft-fallback: file-walk import resolution
   ▼
enforceSizeCap()                         hotspot-ranked top-N truncation under model-aware byte cap
```

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

- **File splits follow the `max-lines: 300` ESLint rule**: Controller → Support → Helpers → Refresher is a deliberate 4-way split, not a layering decision. Don't merge them.
- **Dynamic imports for cache invalidation**: `contextPacketBuilder` and `contextSelectionSupport` are loaded via `import()` inside event handlers to avoid circular dependencies with the orchestration layer.
- **Module-detection is directory-driven post-Wave-69**: the older three-stage pipeline (directory walk + barrel/import signals + import-graph refinement via `importGraphAnalyzer.ts` + `languageStrategies.ts`) was removed in Wave 69 Phase D. Module identity now comes from `moduleDetector*.ts` against directory structure; cross-module deps and exports come from the codebase graph.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

(Pre-Wave-69 Option A/B/C pipeline section was removed in 2026-05 — that pipeline no longer exists. The auto-generated section above describes the current graph-backed shape.)
