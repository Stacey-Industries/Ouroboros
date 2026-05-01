# Wave 69 Phase A Audit — Context-Layer Graph Integration

**Produced by:** sonnet-architect (Phase A, read-only)
**Date:** 2026-05-01
**Gate:** Phase B does not start until this audit is reviewed by the orchestrator.

---

## ESCALATIONS — Review Before Dispatching Phase B

### ESCALATE-1 (P0): `languageStrategies.ts` has an external caller outside the deletion set

`src/main/orchestration/repoIndexerHelpers.ts:4-7` imports two symbols from `src/main/contextLayer/languageStrategies.ts`:
- `getAllImportableExtensions` — used at module load time to build `IMPORTABLE_EXTENSIONS_CACHE: Set<string>`
- `getStrategyForLanguage` — used inside `repoIndexerHelpers` to extract imports per file

The orchestration subsystem's own CLAUDE.md explicitly lists `../contextLayer/` as a dependency for "Language strategies".

**Phase D as written will break the build.** Deleting `languageStrategies.ts` removes a dependency of `repoIndexerHelpers.ts`, which is production orchestration code outside the contextLayer.

**Recommended resolution:** Shrink Phase D's deletion scope from four files to two. Only `importGraphAnalyzer.ts` and `importGraphAnalyzerSupport.ts` are safely deletable outright. `languageStrategies.ts` and `languageStrategiesSupport.ts` must stay because the orchestration layer's import-extraction (during repo indexing) consumes them. The contextLayer's *own* consumption disappears when D deletes `importGraphAnalyzer.ts`. Net deletion shrinks from ~600 to ~250 lines of source.

Alternative (preserves full deletion at the cost of a refactor sub-task): move `getAllImportableExtensions` and `getStrategyForLanguage` (and their transitive support functions) into a new shared module under `orchestration/` or a new `src/main/shared/`, then update `repoIndexerHelpers.ts`. Adds time; restores the headline 600-line deletion.

This does not conflict with the spirit of Decision 4 (delete the contextLayer's own import-resolution pipeline) — but it does conflict with the literal four-file list. The ADR text needs amendment.

---

### ESCALATE-2 (P0): `queryGraph` LIMIT 200 cap makes single-query cross-module deps infeasible

The wave plan's Phase B3 specifies "a single Cypher query that returns IMPORTS + CALLS counts grouped by module-pair." The cypherEngine caps results at 200 rows per `queryGraph` call. A global `MATCH (a)-[r:CALLS]->(b)` on a 48K-edge graph returns only 200 rows — losing the bulk of cross-module dependency coverage.

**Revised B3 approach:** Per-module-pair queries rather than global. For each of N modules:
```cypher
MATCH (a)-[r:CALLS]->(b)
WHERE a.filePath LIKE '<moduleA.rootPath>%'
  AND NOT b.filePath LIKE '<moduleA.rootPath>%'
RETURN b.filePath AS tgt, count(r) AS weight
LIMIT 50
```
With ~20–30 modules × 2 (IMPORTS + CALLS) = 40–60 Cypher calls per `generateRepoMap` rebuild. Bounded, correct, but slower than the wave plan envisioned.

This does not require changing a locked decision — Decision 4 / B3 says "single Cypher query (or batched queries)". The "batched queries" path is what we use. The wave plan's risk register already calls this out: "If the engine times out or returns wrong results, B3 falls back to per-pair queries." Treat the LIMIT cap as that condition firing.

**Flag for B3 implementer:** Don't try the single-query path first. Go directly to per-module batched queries. Cache results for the duration of one `generateRepoMap` call.

---

### ESCALATE-3 (P1): `contextInjector.ts` and `orchestration/types.ts` not named in B1 touch points

The wave plan names `repoMapGenerator.ts` and `contextLayerTypes.ts` as Phase B1 touch points. Two additional files break when `exports: string[]` becomes `exports: ModuleExport[]`:

- `src/main/contextLayer/contextInjector.ts:99` — `entry.structural.exports.map((exp) => exp.toLowerCase())` becomes `exp.name.toLowerCase()`
- `src/main/contextLayer/contextInjector.ts:184` — `exports: entry.structural.exports.slice(0, 10)` passes through to `ModuleContextSummary.exports` in `orchestration/types`
- `src/main/orchestration/types*.ts` — `ModuleContextSummary.exports` field type also cascades

Not an escalation requiring user input — the B1 implementer must be told explicitly. Surfaced here so it doesn't get missed.

---

## Section 1: Per-Symbol Inventory of `src/main/contextLayer/`

35 files total (20 source, 9 test, 1 CLAUDE.md, 5 support files).

### File: `repoMapGenerator.ts`

| Symbol | Label | Phase | Notes |
|--------|-------|-------|-------|
| `REPO_MAP_SIZE_CAP_BYTES` (const) | REPLACE-WITH-GRAPH | C | Replaced by `repoMapBudgets.ts` model-aware table |
| `TRUNCATED_EXPORTS_LIMIT` (const) | KEEP | — | Step 1 truncation limit stays |
| `MAX_MODULES_AFTER_TRUNCATION` (const) | KEEP | — | Top-30 cap stays |
| `MIN_DEPENDENCY_WEIGHT_AFTER_TRUNCATION` (const) | KEEP | — | Weight filter stays |
| `COMPRESSED_EXPORTS_LIMIT` (const) | KEEP | — | Compress cap stays |
| `GenerateRepoMapOptions` (interface) | REPLACE-WITH-GRAPH | C | Gains optional `model?: string` parameter |
| `buildRepoMapFromSummaries` (fn) | KEEP | — | Internal builder; shape unchanged |
| `generateRepoMap` (fn) | REPLACE-WITH-GRAPH | B1/B2/B3 | Body substantially rewritten; signature gains `model?: string`; internal calls add graph queries |
| `compressRepoMap` (fn) | REPLACE-WITH-GRAPH | B1 | `exports.slice(0, COMPRESSED_EXPORTS_LIMIT)` currently returns `string[]`; must return `ModuleExport[]` after B1 |
| `detectElectronFramework` / `detectReactFramework` / `buildFrameworkChecks` / `detectFrameworks` | KEEP | — | Framework detection unchanged |
| `detectProjectName` / `detectProjectNameAsync` / `readPackageJsonName*` | KEEP | — | Unchanged |
| `collectAllFiles` / `detectModulesFromRoots` / `aggregateLanguages` / `buildEmptyRepoMap` (internal) | KEEP | — | Unchanged |
| `enforceSizeCap` (fn) | REPLACE-WITH-GRAPH | B2 | Step 3 sort comparator changes from `fileCount` to hotspot score; gains hotspot score param from B2 helper |
| `matchesAnyPattern` / `matchesAnyGlob` (internal) | KEEP | — | Unchanged |

### File: `contextLayerController.ts`

All `ContextLayerControllerImpl` methods: KEEP. Two minor updates in Phase C: `runFullRebuild` passes `model` to `generateRepoMap`; `enrichPacket` passes `model` to `injectContextLayer`. Registry re-exports: NO-CHANGE.

### File: `contextLayerControllerSupport.ts`

| Symbol | Label | Phase | Notes |
|--------|-------|-------|-------|
| `DEFAULT_MODULE_DEPTH_LIMIT` | KEEP | — | |
| `collectModulesFromTree` / `detectModules` | KEEP | — | Decision 1: directory-driven identity stays |
| `resolveRelativeImport` (internal) | DELETE | D | Used only by import-analysis helpers |
| `classifyImport` / `analyzeModuleImportPatterns` / `classifyFileImports` / `computeBoundaryStrength` (internal) | DELETE | D | Import analysis helpers |
| `applyImportAnalysis` (fn) | DELETE | D | "Option B" stage; Decision 4 |
| `applyFileMovements` (internal) | DELETE | D | Graph analysis helper |
| `applyGraphAnalysis` (fn) | DELETE | D | "Option C" stage; Decision 4. Caller: `contextLayerRefresher.ts` calls this — must be removed there too |
| `logGraphResults` (internal) | DELETE | D | Used only by `applyGraphAnalysis` |
| `FRAMEWORK_MAP` / `detectFrameworks` (internal) / `buildRepoMap` | NO-CHANGE | — | Returns `RepoMapSummary` used by refresher; different from `repoMapGenerator.generateRepoMap` |
| Re-exports from helpers / module summary | KEEP | — | |

### File: `contextLayerControllerHelpers.ts`

`ModuleBoundarySignals` (interface) → DELETE eligible after D, but keep type definition since `DetectedModule` still references it; the fields just stop being populated. `DetectedModule`, `CachedModuleData`, `DirNode`, `isCodeFile`, `normalizePath`, `collectAllFiles`, `buildExportsFromFiles`, `buildDirTree`, `makeModule`, `computeModuleHash`, `selectRepresentativeFiles`, GC helpers, queue helpers: all KEEP.

> Note: After Phase D removes `applyImportAnalysis`, `boundarySignals` fields on `DetectedModule` always carry zero-initialized values. `contextLayerModuleSummary.scoreModuleForGoal` (lines 62–65) reads `boundaryStrength` and `barrelImportCount` for scoring — these always evaluate to 'weak'/0 post-D. Acceptable degradation; remove dead scoring branch in post-D cleanup, not as a Phase D blocker.

### File: `contextLayerControllerTypes.ts`

All KEEP / NO-CHANGE.

### File: `contextLayerTypes.ts`

| Symbol | Label | Phase | Notes |
|--------|-------|-------|-------|
| `ContextLayerConfig` / `ModulePattern` / `ModuleIdentity` / `ExtractedSymbol` | KEEP | — | |
| `ModuleStructuralSummary` (interface) | REPLACE-WITH-GRAPH | B1 | `exports: string[]` becomes `exports: ModuleExport[]` |
| `ModuleAISummary` / `ModuleContextEntry` / `RepoMap` | KEEP (cascade) | — | Type changes via `ModuleStructuralSummary` |
| `ContextLayerManifest` / `ContextInvalidationEvent` | KEEP | — | |

**New type to add (Phase B1):**
```typescript
export interface ModuleExport {
  name: string;
  signature: string | null;
  kind: 'Class' | 'Function' | 'Method';
}
```

### File: `contextInjector.ts`

| Symbol | Label | Phase | Notes |
|--------|-------|-------|-------|
| `InjectionContext` (interface) | KEEP | C | Gains optional `model?: string` |
| `MAX_TOTAL_INJECTION_TOKENS` (const) | REPLACE-WITH-GRAPH | C | Replaced by `repoMapBudgets.ts` lookup |
| `estimateTokens` / `selectByFileOverlap` / `selectByDependencyAdjacency` / `backfillRecentlyChanged` / `selectRelevantModules` | KEEP | — | Decision 6: selection logic stays |
| `selectByKeyword` (fn) | REPLACE-WITH-GRAPH | B1 | Line 99: `exp.toLowerCase()` → `exp.name.toLowerCase()` after exports type change |
| `buildModuleSummary` (fn) | REPLACE-WITH-GRAPH | B1 | Line 184: passes `ModuleExport[]` through to `ModuleContextSummary.exports` |
| `enforceTokenBudget` (fn) | REPLACE-WITH-GRAPH | C | Uses `MAX_TOTAL_INJECTION_TOKENS`; gains `model` param |
| `injectContextLayer` (fn) | REPLACE-WITH-GRAPH | C | Gains `model?: string` in `InjectionContext` |

### File: `moduleDetector.ts` and `moduleDetectorUtils.ts`

All KEEP. Decision 1: directory-driven identity stays. Re-exports `buildCrossModuleDependencies` and `buildModuleStructuralSummaries` from helpers — see below.

### File: `moduleDetectorHelpers.ts`

| Symbol | Label | Phase | Notes |
|--------|-------|-------|-------|
| `buildModuleStructuralSummaries` | KEEP | — | File-walk summary builder; unchanged |
| `buildCrossModuleDependencies` | REPLACE-WITH-GRAPH | B3 | Body replaced with batched Cypher queries. Signature preserved |
| `buildFilesByModuleMap` and other helpers | KEEP | — | |

### File: `importGraphAnalyzer.ts`

All symbols: **DELETE (Phase D)**. Callers outside the deletion set:
- `contextLayerRefresher.ts:20` — imports `buildResolvedImportGraph`, `computeModuleCohesion`. Phase D must remove these import lines and the calls in `updateModuleCache` / `refreshDirtyModuleCache`.
- `contextLayerModuleSummary.ts:11` — imports `ModuleCohesionMetrics` type. Phase D must remove import; remove `cohesionMetrics?` parameter from `buildSingleModuleSummary` (or keep as no-op).
- `contextLayerControllerSupport.ts` — imports `buildResolvedImportGraph`, `computeModuleCohesion`, `refineModuleAssignments`. Phase D removes both `applyImportAnalysis` and `applyGraphAnalysis`, so these imports become orphaned.

### File: `importGraphAnalyzerSupport.ts`

All DELETE (only consumed by `importGraphAnalyzer.ts`).

### File: `languageStrategies.ts` — **PARTIAL DELETE**, see ESCALATE-1

Survives in Phase D under the recommended scope shrink. Symbols consumed externally (`getAllImportableExtensions`, `getStrategyForLanguage`) MUST remain. Internal symbols (`tryMatch`, `basename`, etc.) used only by `languageStrategiesSupport.ts` also remain.

The contextLayer's own consumption (via `importGraphAnalyzer.ts`) disappears with that file's deletion. No code change needed to `languageStrategies.ts` itself.

### File: `languageStrategiesSupport.ts`

KEEP (under recommended scope shrink). Only consumed by `languageStrategies.ts`.

### File: `contextLayerRefresher.ts`

| Symbol | Label | Phase | Notes |
|--------|-------|-------|-------|
| `ModuleCacheState` | KEEP | — | |
| `updateModuleCache` (fn) | REPLACE-WITH-GRAPH | D | Remove `buildResolvedImportGraph` and `computeModuleCohesion` calls; keep hash-based cache invalidation and `buildSingleModuleSummary` |
| `refreshDirtyModuleCache` (fn) | REPLACE-WITH-GRAPH | D | Same as above |
| `maybeRunGraphAnalysis` (fn) | DELETE | D | Body calls deleted `applyGraphAnalysis` |
| `countRefreshedModules` | KEEP | — | |

### File: `contextLayerModuleSummary.ts`

`buildSingleModuleSummary`: REPLACE-WITH-GRAPH (D). Drop `cohesionMetrics?` param + import. `selectModuleSummariesForGoal`: KEEP (Decision 6). `scoreModuleForGoal` (internal): post-D it always returns 0 for boundary scoring; degrade gracefully.

### Other files

- `contextLayerRegistry.ts`, `contextLayerStore.ts`, `contextLayerGC.ts`, `contextLayerWatcher.ts`, `summarizationQueue.ts`, `summarizationQueueHelpers.ts`, `moduleSummarizer.ts`: all NO-CHANGE.

### Test files

| File | Label | Notes |
|------|-------|-------|
| `importGraphAnalyzer.test.ts` | DELETE (D) | Tests for deleted file |
| `languageStrategies.test.ts` | KEEP | File survives under recommended scope |
| `repoMapGenerator.test.ts` | REPLACE-WITH-GRAPH | B1/B2/B3/C — update for new shapes |
| `contextLayerController.test.ts` | KEEP | Update mocks for `generateRepoMap` signature |
| `contextInjector.test.ts` | REPLACE-WITH-GRAPH | B1 — exports field now `ModuleExport[]` |
| Others | NO-CHANGE | |

## Inventory Summary

| Label | Count |
|-------|-------|
| KEEP | ~65 |
| REPLACE-WITH-GRAPH | ~15 |
| DELETE | ~25 (was ~45 under original Decision 4 scope) |
| NO-CHANGE | ~40 |

---

## Section 2: Sequence Diagram — New Graph-Backed `generateRepoMap` Flow

```
sequenceDiagram
    participant Controller as ContextLayerControllerImpl
    participant Generator as repoMapGenerator.ts
    participant GraphCtrl as GraphControllerLike
    participant Ranking as repoMapGeneratorRanking.ts (new)
    participant Graph as repoMapGeneratorGraph.ts (new)
    participant Detector as moduleDetector.ts

    Controller->>Generator: generateRepoMap({ repoFacts, repoIndex, workspaceRoot, model? })
    Generator->>Generator: collectAllFiles(repoIndex)
    alt allFiles.length === 0
        Generator-->>Controller: buildEmptyRepoMap(workspaceRoot)
    end
    Generator->>Detector: detectModulesFromRoots(repoIndex, isMultiRoot)
    Detector-->>Generator: ModuleIdentity[]
    Generator->>Detector: buildModuleStructuralSummaries({ ... })
    Detector-->>Generator: ModuleStructuralSummary[]

    Generator->>GraphCtrl: getGraphController()
    alt graph not ready (null)
        Generator->>Generator: structural-skeleton-only path
        note right of Generator: exports = ModuleExport[] with signature: null\nno hotspot ranking (fileCount only)\nno graph-derived deps (file-walk fallback path stays available)
        Generator-->>Controller: RepoMap (fallback shape)
    else graph available
        note right of Generator: B1 — export queries (per module)
        Generator->>Graph: queryModuleExports(rootPath, projectName)
        Graph->>GraphCtrl: queryGraph(<exports Cypher>)
        GraphCtrl-->>Graph: rows
        Graph-->>Generator: ModuleExport[] per module

        note right of Generator: B2 — hotspot scoring (single global query)
        Generator->>Ranking: computeAllModuleHotspotScores(modules, projectName)
        Ranking->>GraphCtrl: queryGraph(<hotspots Cypher>)
        GraphCtrl-->>Ranking: rows
        Ranking->>Ranking: aggregate per-module
        Ranking-->>Generator: Map<moduleId, hotspotScore>

        note right of Generator: B3 — cross-module deps (~60 batched queries; not single)
        Generator->>Graph: queryModuleDeps(modules)
        loop per module pair × edge type
            Graph->>GraphCtrl: queryGraph(<per-module deps Cypher>)
            GraphCtrl-->>Graph: rows
        end
        Graph-->>Generator: Array<{ from, to, weight }>

        Generator->>Generator: buildRepoMapFromSummaries(...)
        Generator->>Generator: enforceSizeCap(repoMap, hotspotScores, model)
        Generator->>Ranking: sortByHotspotScore (Step 3 of cap)
        Ranking-->>Generator: sorted ModuleContextEntry[]
        Generator-->>Controller: RepoMap (graph-backed shape)
    end
```

Key flow notes:
- `getGraphController()` checked once. Null branch produces today's behavior (name-only exports as `ModuleExport[]` with `signature: null`, fileCount ranking, file-walk deps).
- B2's hotspot query is global (top-200 functions/methods by inbound CALLS) and aggregated in memory — avoids N per-module queries.
- B3 is per-module-pair due to LIMIT 200 cap (see ESCALATE-2).
- `enforceSizeCap` receives pre-computed `hotspotScores: Map<string, number>` to avoid re-querying.

---

## Section 3: GraphControllerLike API Gap Analysis

### Pre-flight 1: Export query

Conceptual query:
```cypher
MATCH (n)
WHERE n.filePath STARTS WITH $modulePath
AND labels(n) IN ['Class', 'Function', 'Method']
RETURN n.name, n.props.signature AS signature, labels(n)[0] AS kind
LIMIT 50
```

**Status post-Wave-68:**
- `labels(n)` returning string: CONFIRMED (Wave 68 Bug 4 fix).
- `n.props.signature` present: CONFIRMED per wave plan note about `getNodeSignature` reading `node.props.signature`.
- `STARTS WITH` operator: NOT CONFIRMED in Wave 68 supported subset. Wave 68 explicitly tested `=` and pattern-LIKE forms but `STARTS WITH` isn't enumerated.

**P1 GAP — `STARTS WITH` operator unconfirmed.** Workaround: use `LIKE 'prefix%'` form, OR fetch unfiltered then filter in JS (~1K rows max with `LIMIT`). B1 implementer must smoke-test this before writing the full implementation.

### Pre-flight 2: Cross-module deps query

Conceptual ideal:
```cypher
MATCH (a)-[r:IMPORTS|CALLS]->(b)
WHERE a.filePath IS NOT NULL AND b.filePath IS NOT NULL
RETURN a.filePath AS src, b.filePath AS tgt, count(r) AS weight
```

**Status:**
- Multi-type relationship `[r:IMPORTS|CALLS]`: NOT confirmed. Wave 68 deferred multi-pattern MATCH.
- `count(r)`: confirmed (Wave 68 Bug 2 fix).
- LIMIT 200 cap: confirmed — would truncate global edge enumeration.

**P0 GAP (ESCALATE-2):** Single-query approach infeasible. Use per-module batched queries instead.

**P1 GAP — multi-type edge filter unsupported.** Workaround: split into per-edge-type queries, merge in memory.

### Pre-flight 3: Hotspot data shape

`getArchitecture(['hotspots'])` returns `Array<{ filePath: string; inDegree: number; outDegree: number }>` via `parseHotspots` adapter (string parsing layer). Top-20 entries only — globally, not per-module. Many modules will get score 0 simply because their functions aren't in the top 20 globally.

**P1 GAP — `getArchitecture` returns only top-20.** Recommendation: B2 should use `queryGraph` directly for inbound-degree ranking with broader coverage (LIMIT 200):
```cypher
MATCH (n) WHERE labels(n) IN ['Function', 'Method']
RETURN n.filePath, size(()-[:CALLS]->(n)) AS inbound
ORDER BY inbound DESC
LIMIT 200
```
If `labels(n) IN [...]` filter isn't supported, split into two queries (Function, Method) and merge.

### Summary of API gaps

| Gap | Severity | Phase | Workaround |
|-----|----------|-------|-----------|
| `STARTS WITH` unconfirmed | P1 | B1, B2, B3 | Use `LIKE 'prefix%'` or filter in JS |
| `labels(n) IN [...]` unconfirmed | P1 | B1, B2 | Split into per-label queries |
| Multi-type `[r:T1\|T2]` unsupported | P1 | B3 | Two queries, merge in memory |
| LIMIT 200 cap on global queries | P0 | B3 | Per-module batched queries |
| `getArchitecture` top-20 only | P1 | B2 | Use `queryGraph` directly |

**None require a Wave 70 cypherEngine fix.** All addressable within Wave 69 by choosing the per-module / multi-query patterns.

---

## Post-Wave-68b verification (2026-05-01)

Wave 68b (commit `01dbd16`) shipped three engine improvements that change the audit's API gap status:

1. **`n.signature` works** — props.* fall-through in `resolveColumnExpression` makes any non-SQL-column key reachable as `json_extract(props, '$.<key>')`. Live verified: `MATCH (n:Function) WHERE n.name = 'generateRepoMap' RETURN n.name, n.signature` returns `"(options: GenerateRepoMapOptions): RepoMap"`. The B1 query plan can now use the single-query shape the wave plan originally envisioned.

2. **`labels(n) IN [...]` actually filters** — parser recognizes `labels(alias) IN [...]` and `alias.prop IN [...]` and emits `IN (?, ?, ?)` SQL. Both forms supported. Live verified.

3. **Parser strictness** — `parseWhere` throws `"Unsupported WHERE condition: ..."` on shapes it doesn't understand (NOT, EXISTS, malformed IN, etc.) instead of silently dropping them. B1's queries will fail loudly if they accidentally use unsupported syntax — better than running with un-filtered results.

**Verified working pattern for B1** (live tested against the production graph):
```cypher
MATCH (n)
WHERE n.file_path STARTS WITH 'src/main/contextLayer'
  AND labels(n) IN ['Class', 'Function', 'Method']
RETURN n.name, n.signature, labels(n) AS kind
LIMIT 50
```

Returned: `createMockModuleIdentity | (id: string, ...): ModuleIdentity | Function` (and 9 more rows). This is the **exact shape** B1 needs for `queryModuleExports`.

**Other findings that survived Wave 68b unchanged:**
- The 200-row LIMIT cap still applies (ESCALATE-2). B3 still needs per-module-pair batched queries.
- Multi-type `[r:T1|T2]` edge filter is still unsupported. B3 still splits IMPORTS and CALLS into separate queries, merges in memory.
- `getArchitecture(['hotspots'])` still returns top-20 globally (P1). B2 should still use `queryGraph` directly with the now-verified pattern.

**Net effect on B1:**
- B1 implementer no longer needs to smoke-test operators. The verified pattern above is the contract.
- Soft-fallback shape unchanged: when `getGraphController()` returns null, build `ModuleExport[]` with names from the file-walk path and `signature: null`.
- All other audit findings (ESCALATE-1 Phase D scope; ESCALATE-3 contextInjector + orchestration cascade; GC stale-file guard) still apply.

---

## Implementation Risks

1. **`STARTS WITH` smoke test**: B1 implementer must verify the operator before committing to the implementation pattern. If `LIKE` is also missing, fall back to JS-side filtering.

2. **B3 latency**: ~60 Cypher calls per `generateRepoMap` rebuild. Each is bounded at 50 rows. Estimate 200–500ms IPC overhead. Profile in Phase E. If too slow, cache deps for 60s rather than per-call.

3. **`contextLayerRefresher.ts` scope**: Phase D must clean up `updateModuleCache`, `refreshDirtyModuleCache`, and `maybeRunGraphAnalysis`. Wave plan names support files; refresher is implicit.

4. **`orchestration/types.ts` `ModuleContextSummary.exports`**: Currently `string[]`. Must become `ModuleExport[]`. Cascades into final prompt formatting in orchestration. B1 implementer must trace consumers of `ModuleContextSummary.exports` across `orchestration/`.

5. **Soft-fallback shape consistency**: Fallback path must return `ModuleExport[]` (not `string[]`) even when name-only. TypeScript will catch mismatches.

6. **GC reconciliation window**: Old `.context/modules/*.json` files have `exports: string[]`. After B1, fresh writes have `exports: ModuleExport[]`. Stale-file deserialization gives wrong shape. Add shape-validation guard in `buildModuleSummary`: if `entry.structural.exports[0]` is a string, treat entry as stale and skip.

---

## Acceptance Gate for Phase B Dispatch

The orchestrator should not dispatch Phase B until:

- [x] Audit exists (this file).
- [ ] User decision on ESCALATE-1 scope (Option A: shrink Phase D to 2 files; Option B: refactor `getAllImportableExtensions` / `getStrategyForLanguage` out of contextLayer first).
- [ ] User acknowledgment of ESCALATE-2 (B3 will use batched per-module queries, not single query — already sanctioned by wave plan's risk register).
- [x] B1 implementer briefed to also touch `contextInjector.ts` and `orchestration/types*.ts` (ESCALATE-3).
- [x] B1 implementer briefed to smoke-test `STARTS WITH` / `LIKE` / `labels() IN [...]` operators against the live graph before committing to implementation pattern.

ESCALATIONS-1 and -2 are blockers for Phase D and B3 respectively. ESCALATION-3 and the smoke-test instructions are briefing items for B1 — not blockers.
