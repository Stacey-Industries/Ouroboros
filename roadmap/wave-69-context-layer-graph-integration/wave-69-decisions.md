# Wave 69 — ADR: Context-Layer Graph Integration

**Status:** LOCKED 2026-05-01 by orchestrator.
**Plan:** `roadmap/wave-69-context-layer-graph-integration.md`

---

Waves 67 and 68 took the codebase-memory graph from "5 DEFINES edges across 3,328 files" (effectively unusable for symbol-level work) to **18,277 DEFINES edges + queryable Cypher surface**. The graph now has Class/Function/Method nodes with `signature` properties, project-scoped queries, hotspot computation via PageRank-equivalent inbound-degree scoring, and a stable `GraphControllerLike` consumer API.

Meanwhile, the contextLayer (`src/main/contextLayer/`) — which builds the repo map injected into every IDE chat-agent session — is still on the hand-rolled path that predated the working graph. It walks files itself, infers exports from heuristics, builds its own import graph in "Option C" (`importGraphAnalyzer.ts`), and ranks modules by `fileCount` (size proxy) and `recentlyChanged` (binary recency). It duplicates work the indexer already does, with strictly weaker output: module exports are name-only (no signatures), ranking is structural-skeleton only (no PageRank), and the size budget is hardcoded at 8 KB regardless of model.

Wave 69 makes the contextLayer a graph consumer. It does not redesign the contextLayer's goal-conditioned selection, AI summarization, or per-module storage scheme — those remain the contextLayer's load-bearing contributions. The seven decisions below govern which pieces stay, which get replaced, and how the integration is sequenced.

---

## Decision 1: Module identity stays directory-driven

**Context:** The codebase graph has no concept of "module." It has File, Class, Function, Method, Interface, Type, Enum, and Project nodes. A "module" in the contextLayer sense is a feature-folder grouping (`src/main/contextLayer/`) or a flat-prefix grouping — a pragmatic abstraction the graph does not provide.

**Options considered:**
- *Replace `moduleDetector.ts` with a graph-derived clustering:* Use community detection or import-graph clustering on the symbol graph to derive modules. Eliminates the directory-walk pipeline.
- *Keep directory-driven module detection; layer graph data on top:* `moduleDetector.ts` continues to identify modules from the file tree (Option A); graph queries augment per-module data (exports with signatures, ranking, dependencies).
- *Hybrid:* Directory-driven for primary identity, graph-clustering as a refinement step (the current "Option C" but using the real graph instead of a parallel one).

**Pick:** Keep directory-driven module detection. The graph augments per-module data; it does not replace module identity.

**Rationale:** Feature-folder structure is meaningful to humans and authors; agent-friendly module names like "agent-chat", "context-layer", "file-tree" come from directories, not from symbol clusters. Symbol-graph clustering would produce non-obvious groupings ("all classes that call sqlite") that don't match how the codebase is organized or discussed. The current directory-walk is also stable across small refactors in a way that import-graph clustering is not. The graph's value is per-module *content*, not module *identity*.

**Consequences:** `moduleDetector.ts`, `moduleDetectorHelpers.ts`, and `moduleDetectorUtils.ts` are out of scope for deletion. Their three-stage detection (feature-folders → config-group → flat-groups) stays. What changes is what data each module gets attached to it — see Decisions 2–4.

---

## Decision 2: Module exports come from the graph with signatures

**Context:** Current behavior — `moduleDetector` walks files in each module and produces an `exports: string[]` list of names (e.g., `["FileTree", "anthropicAuth", "contextInjector"]`). Names alone are nearly useless to a model: it cannot infer signatures, parameters, or return types without reading the file. The graph already has all of this — `node.props.signature` is a string property on every Class / Function / Method node, populated by tree-sitter extraction during indexing.

**Options considered:**
- *Keep names-only:* Cheapest to maintain. Loses the largest available win.
- *Names with signatures from a separate tree-sitter pass:* Re-extract signatures on demand. Duplicates work the indexer already did.
- *Names with signatures from the graph:* Single Cypher query per module; data already populated. `MATCH (n) WHERE n.filePath STARTS WITH '<modulePath>' AND n.label IN ['Class','Function','Method'] RETURN n.name, n.props.signature, n.label` (post-Wave-68 Cypher supports this).

**Pick:** Names with signatures from the graph. Each module entry's `exports` field becomes `Array<{ name: string; signature: string | null; kind: 'Class' | 'Function' | 'Method' }>` — name kept for backward compatibility, signature added, kind disambiguates.

**Rationale:** Signatures triple the information density per module entry at near-zero infrastructure cost — the data is already there. Aider, Continue.dev, and the rest of the structured-context industry standardized on this years ago; name-only ranks as legacy.

**Consequences:** `RepoMap` and `ModuleContextEntry` types in `contextLayerTypes.ts` change shape — `exports: string[]` becomes `exports: ModuleExport[]`. All readers (`compressRepoMap`, `selectModuleSummariesForGoal`, `contextInjector.buildModuleSummary`) update accordingly. The module-summary on-disk JSON files in `.context/modules/*.json` change schema — the GC pass (`graphGc.ts` for the graph; `contextLayerGC` for the contextLayer) will reconcile by writing fresh entries. Old format files are dropped on next refresh; no migration needed.

---

## Decision 3: Module ranking comes from graph hotspots, not file count

**Context:** Current behavior — modules are ranked for the size-cap truncation step by `entry.structural.fileCount` (size as a proxy for importance) and `entry.structural.recentlyChanged` (binary recency). This is a weak signal: a 12-file utility module may rank above a 4-file module that's the architectural backbone of the system. The graph already computes a stronger signal — `QueryEngine.computeHotspots()` scores Function and Method nodes by inbound CALLS-edge count, which is PageRank-equivalent for this graph shape.

**Options considered:**
- *Keep file-count ranking:* No change. Ships fastest. Locks in the weakness.
- *Add a configurable ranking strategy switch:* Let users pick between file-count, hotspot-derived, or hybrid. Adds config surface; produces inconsistent agent behavior across users.
- *Replace file-count with hotspot-derived ranking:* For each module, sum the hotspot scores of its symbols (Function + Method nodes whose `filePath` starts with the module's `rootPath`) to produce a module-level importance score. Use that score in `enforceSizeCap`'s top-N truncation step.

**Pick:** Replace file-count with hotspot-derived ranking. No config switch — the better signal is universally better; preserving the old as a "legacy mode" just adds branches that need tests.

**Rationale:** PageRank-style importance ranking has been the industry standard since Aider published its repo-map design in late 2023. It correctly identifies load-bearing modules even when they're small (a 200-line core type registry beats a 2000-line one-shot CLI parser). The graph computes it as part of normal operation; the contextLayer just needs to query and aggregate. Keeping file-count as a fallback is unprincipled — file count is wrong, not different.

**Consequences:** `repoMapGenerator.ts:enforceSizeCap` Step 3 changes from `sortedModules = [...].sort((l, r) => r.fileCount - l.fileCount)` to a hotspot-score-based comparator. Modules with no hotspot entries (e.g., type-only modules with no Function/Method nodes) fall back to file-count as a tiebreaker. The aggregation lives in a new `repoMapGeneratorRanking.ts` helper to keep `repoMapGenerator.ts` under the 300-line cap.

---

## Decision 4: Cross-module dependencies come from CALLS + IMPORTS edges

**Context:** Current behavior — `moduleDetectorHelpers.buildCrossModuleDependencies` walks each file's imports, resolves them via `languageStrategies.ts` per-language extraction (10 languages, ~600 lines), and tallies edges between modules. The graph already has these edges — IMPORTS edges from `treeSitterParserImports.ts` and CALLS edges from `treeSitterParserCalls.ts` + `indexingPipelineCallResolution.ts`. The contextLayer is reimplementing what the indexer already did, with strictly weaker resolution (the contextLayer can't resolve dynamic imports or path-aliased imports for languages outside its 10-language list; the graph handles all 30+ supported by `tree-sitter-wasms`).

**Options considered:**
- *Keep `languageStrategies.ts`:* Maintains parity for any language not yet covered by the graph. Guarantees a duplicate-work pipeline forever.
- *Hybrid (graph for supported languages, fallback for others):* Use graph edges where available; fall back to `languageStrategies.ts` for languages the graph doesn't index. Two pipelines to maintain; near-impossible to test exhaustively.
- *Graph-only:* `MATCH (a)-[r:IMPORTS|CALLS]->(b) WHERE a.filePath STARTS WITH '<moduleA>' AND b.filePath STARTS WITH '<moduleB>' RETURN count(r) AS weight`, iterated over module pairs (or one batch query). Delete `languageStrategies.ts`, `languageStrategiesSupport.ts`, `importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`.

**Pick:** Graph-only. Delete the four files (~600 lines). If a future repository needs a language the graph doesn't support, that's a graph problem to solve in `treeSitterLanguageConfigs.ts`, not a contextLayer problem to solve twice.

**Rationale:** The four files exist because the graph wasn't usable when the contextLayer was written. Now it is. Maintaining two import-resolution paths means every language change has to be made twice, and the contextLayer's path drifts whenever the graph improves (the graph already handles `@renderer/*` path aliases; the contextLayer's resolver is more brittle). One source of truth is the right shape.

**Consequences:** `importGraphAnalyzer.ts` (200 lines), `importGraphAnalyzerSupport.ts` (~150 lines), `languageStrategies.ts` (300 lines), `languageStrategiesSupport.ts` (~200 lines) deleted. `contextLayerControllerSupport.ts:applyImportAnalysis` and `applyGraphAnalysis` removed. The "Option B / Option C" stages of module detection collapse — module detection becomes Option A only (directory walk), and graph queries replace what Options B and C did. Tests covering those files are deleted with them. Module entries gain an `importedFrom: string[]` field for the inbound dependency list (currently buried inside the cross-module deps array).

---

## Decision 5: Token budget becomes model-aware

**Context:** Current behavior — `REPO_MAP_SIZE_CAP_BYTES = 8192` is a single hardcoded constant in `repoMapGenerator.ts`. `MAX_TOTAL_INJECTION_TOKENS = 2000` is a similar constant in `contextInjector.ts`. Neither scales with the model's actual context window. Opus has 200K tokens of context; Sonnet has 200K; default smaller models have 200K too — but the *willingness to spend on repo map* differs (Opus deserves more rich context; Haiku cannot productively absorb it). The orchestration layer already has a model-aware budget pattern in `contextPacketBuilderSupport.getModelBudgets()` (Opus 32 KB / 8K tokens for files, Sonnet 18 KB / 4.5K, Haiku 12 KB / 3K).

**Options considered:**
- *Keep hardcoded:* Cheapest. Wastes Opus headroom; potentially over-injects for Haiku.
- *Per-call override only:* Caller passes a budget. Pushes complexity to every caller.
- *Model-aware budget table inside the contextLayer:* Lookup table keyed by model string, matching the `getModelBudgets()` pattern; falls through to default when model is unknown.

**Pick:** Model-aware budget table. New `repoMapBudgets.ts` keyed by model:
- Opus → 16 KB raw cap, 4000 tokens injection cap
- Sonnet → 12 KB raw cap, 3000 tokens injection cap
- Haiku / default → 8 KB raw cap, 2000 tokens injection cap (current default preserved)

**Rationale:** Adding signatures (Decision 2) inflates per-module size; keeping the 8 KB cap will force aggressive truncation that defeats the point. The model-aware pattern is already established in the orchestration layer; reusing the same shape avoids divergent budget logic. The default tier matches today's behavior, so unknown models don't regress.

**Consequences:** `REPO_MAP_SIZE_CAP_BYTES` and `MAX_TOTAL_INJECTION_TOKENS` constants are deleted; both become functions of the model. `generateRepoMap` and `injectContextLayer` gain a `model: string` parameter (or read it from the packet). Budget choice is logged via `log.info` for telemetry.

---

## Decision 6: `contextInjector` goal-conditioned selection stays

**Context:** `contextInjector.selectRelevantModules` performs goal-conditioned ranking on top of structural ranking — file-overlap → keyword → dependency-adjacency → recently-changed. This is genuinely beyond what Aider, Continue, or Cursor's static rankings provide. It is the contextLayer's most original and most useful contribution.

**Options considered:**
- *Replace with task-type-aware ranking (Item 6 from the original list):* Speculative; deferred per `roadmap/deferred-task-type-aware-ranking.md`.
- *Replace with pure semantic / embedding ranking:* Different paradigm; would require an embedding store the IDE doesn't have. Out of scope.
- *Keep as-is, layered on graph data:* The selection logic doesn't care where ranking signals come from; substituting graph-derived signals for structural-derived ones is a drop-in change.

**Pick:** Keep `contextInjector` selection logic as-is. Inputs change (graph-derived ranks instead of file-count); outputs and budget enforcement do not.

**Rationale:** This logic is correct and not duplicated by the graph. The graph provides static importance; `contextInjector` provides task-conditioned selection. Both layers are useful and complementary.

**Consequences:** `contextInjector.ts` is largely untouched in Wave 69. Only its inputs (the `RepoMap` shape, the `ModuleContextEntry` shape) change per Decisions 2 and 5. `selectByFileOverlap`, `selectByKeyword`, `selectByDependencyAdjacency`, `backfillRecentlyChanged`, `enforceTokenBudget` keep their structure.

---

## Amendment 1: Decision 4 deletion scope expanded with a relocation sub-task (2026-05-01, post-Phase-A audit)

**Context:** Phase A's audit (`roadmap/wave-69-audit.md`, ESCALATE-1) discovered that `src/main/orchestration/repoIndexerHelpers.ts:4-7` imports `getAllImportableExtensions` and `getStrategyForLanguage` from `contextLayer/languageStrategies.ts`. Decision 4 as originally written would break the orchestration layer's import-extraction.

**Options considered:**
- *Option A — shrink Phase D's scope* to two files (`importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`). Net deletion drops from ~600 lines to ~250.
- *Option B — preserve the full deletion* by relocating the externally-consumed symbols to a new shared module first, then deleting all four.

**Pick:** Option B. User-confirmed 2026-05-01.

**Rationale:** The 600-line deletion is named in the wave plan's goal as "half the value of this wave." Relocation cost is a small, mechanical refactor — cheaper than carrying a duplicated language-strategy pipeline forever.

**Consequences for Phase D:** The phase gains a leading sub-task before the deletions:

1. **D.0 — Relocate.** Move `getAllImportableExtensions`, `getStrategyForLanguage`, and any transitive helpers they need (likely the language strategy registry, the per-language strategies, and `languageStrategiesSupport.ts`) to a new module. Suggested location: `src/main/orchestration/languageStrategies.ts` (co-located with its primary consumer) OR a new `src/main/shared/languageStrategies.ts` if the indexer (`codebaseGraph/`) also gains a need for it. Implementer picks based on what minimizes cross-subsystem churn.
2. **D.1 — Update import paths.** `repoIndexerHelpers.ts` updates its import. Any other external consumers discovered during D.0's grep also update.
3. **D.2 — Delete the four contextLayer files** as originally planned: `importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`, `languageStrategies.ts`, `languageStrategiesSupport.ts` (now empty of external consumers).
4. **D.3 — Remove `applyImportAnalysis` and `applyGraphAnalysis`** from `contextLayerControllerSupport.ts` and their callers in `contextLayerRefresher.ts` (also flagged by the audit).
5. **D.4 — Verify** typecheck + lint + targeted vitest pass.

The deletion target stays at four files. The phase gains a relocation step before the deletion. ESLint's 300-line cap on the new shared module is a constraint to verify during D.0.

---

## Amendment 2: Decision 4's "single Cypher query" path is infeasible — use batched per-module queries (2026-05-01, post-Phase-A audit)

**Context:** Phase A's audit (ESCALATE-2) found that `queryGraph` caps results at 200 rows. A global `MATCH (a)-[r:IMPORTS|CALLS]->(b) ... RETURN ...` query against a 48K-edge graph returns only 200 rows, losing the bulk of cross-module dependency coverage.

**Pick:** Phase B3 uses per-module batched queries instead of a single global query. Approximately 60 Cypher calls per `generateRepoMap` rebuild (~30 modules × 2 edge types). Each query is bounded by `LIMIT 50`. Results cached for the duration of one `generateRepoMap` call.

**Rationale:** The wave plan's risk register already sanctions this fallback ("If the engine times out or returns wrong results, B3 falls back to per-pair queries (slower, correct)"). Treat the LIMIT cap as that condition firing. No locked-decision change required — this is an implementation-pattern selection within the scope Decision 4 already permits ("single Cypher query (or batched queries)").

**Consequences:** B3's implementer goes directly to per-module batched queries; no time wasted attempting the single-query approach. Phase E's integration test asserts the dep-aggregation correctness at this query call count.

---

## Decision 7: Graph-not-ready is a soft fallback, not a hard error

**Context:** The graph has a startup window where it's not yet indexed (cold first launch, post-restart catalog hash mismatch triggering reindex, etc.). During this window, `getGraphController()` may return null, or the graph may be present but not yet populated with the current project's data. Wave 69's repo map generation depends on the graph for exports, ranking, and dependencies. A naive implementation would either throw or produce an empty repo map during this window.

**Options considered:**
- *Hard fail:* If the graph isn't ready, the repo map fails. Forces the user to wait. Wrong behavior — the IDE should still work (just with thinner context) during indexing.
- *Skip context layer entirely:* Disable contextLayer enrichment until the graph is ready. Loses all context — too aggressive.
- *Soft fallback:* If the graph isn't ready or returns no data for a module, fall back to a structural-skeleton-only repo map (module identity, file counts, recently-changed flags — all derivable without the graph). Signatures, hotspot ranking, and graph-derived deps fill in once the graph populates on the next refresh.

**Pick:** Soft fallback. `repoMapGenerator` checks graph readiness via `getGraphController()` + `indexStatus()`. If unavailable: produce a thinner repo map (today's shape, minus the graph-augmented fields). If available: produce the full graph-augmented repo map.

**Rationale:** First-launch UX matters. A fresh clone with no indexed graph should still have a usable contextLayer; the repo map degrades gracefully rather than disappearing. Once the graph populates, the next refresh produces the rich version.

**Consequences:** `repoMapGenerator` gains a `useGraph: boolean` runtime branch. `RepoMap` type's graph-derived fields (`exports[].signature`, `crossModuleDependencies`, hotspot scores) become optional. The result-brief verification probes assert that *with* a populated graph, those fields are filled — confirming the integration works once the graph is ready.

---
