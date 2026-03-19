<!-- claude-md-auto:start -->

The CLAUDE.md for this directory already exists and is accurate. The system reminder shows it was previously generated and verified. No changes needed.

The existing `src/main/contextLayer/CLAUDE.md` is current and covers:

- The three-stage module detection pipeline (Options A/B/C)
- All four files with their roles
- Key patterns (caching, debounce, cooldown, AI enrichment, goal-based selection)
- Dependencies (repoIndexer upstream, claudeCodeAdapter downstream)
- Gotchas (duplicate `isCodeFile`, duplicate `resolveRelativeImport`, path alias mutation order, graph analysis cost threshold)

`★ Insight ─────────────────────────────────────`
The most interesting architectural detail here is the **progressive cost escalation**: Option A (directory walk) runs on every file change; Option B (import signal scoring) runs when modules are dirty; Option C (full graph cohesion + seed clustering) only fires when ≥10% of modules are dirty or ≥5 absolute. This means casual edits pay near-zero cost while large refactors trigger the expensive but accurate analysis.
`─────────────────────────────────────────────────`

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
