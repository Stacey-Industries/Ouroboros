# Wave 69 — Context-Layer Graph Integration · Result Brief

**Status:** Implementation complete. Manual smoke pending.
**Plan:** `roadmap/wave-69-context-layer-graph-integration.md`
**ADR:** `roadmap/decisions/wave-69.md` (with two amendments dated 2026-05-01)
**Audit:** `roadmap/wave-69-audit.md` (with post-Wave-68b verification appendix)
**Date:** 2026-05-01

---

## Goal

Make the contextLayer's repo map a graph consumer. Module exports gain signatures. Module ranking comes from graph hotspot scores. Cross-module deps come from CALLS + IMPORTS edges. Token budget scales by model. The redundant import-graph subsystem (~430 lines) is deleted; language strategies are relocated to the orchestration layer where their sole external consumer lives.

## Commit chain

| Commit | Phase | Summary |
|---|---|---|
| `acbe73e` | B1 | `ModuleExport` type + per-module Cypher exports query + soft-fallback + GC stale-file guard. Type cascade through `ModuleStructuralSummary` / `ModuleContextSummary` / `RepoMapSummary`. |
| `08804cb` | B2 | Hotspot-derived ranking via per-module `MATCH ()-[r:CALLS]->(callee) … COUNT(*)`. New `compareByHotspotThenFileCount` comparator with file-count tiebreaker. |
| `c2a03f6` | B3 | Graph-derived cross-module deps via per-source-module CALLS+IMPORTS enumeration. Soft-fallback to file-walk path when graph isn't ready. |
| `1ca3eb7` | C  | Model-aware budget table (`repoMapBudgets.ts`): Opus 16 KB / 4K, Sonnet 12 KB / 3K, default 8 KB / 2K. `model?` threaded through `generateRepoMap` and `injectContextLayer`. |
| `e7975bc` | D  | Deleted `importGraphAnalyzer.ts` + `importGraphAnalyzerSupport.ts` + their test. Relocated `languageStrategies.ts` + `languageStrategiesSupport.ts` to `orchestration/` per ADR Amendment 1. Removed `applyImportAnalysis` / `applyGraphAnalysis` / `maybeRunGraphAnalysis`. |
| `835e287` | E  | Integration test with in-memory `GraphDatabase` + real `CypherEngine` exercising the full pipeline. |

## Acceptance criteria

- [x] ADR at `roadmap/decisions/wave-69.md` with all 7 decisions + 2 amendments.
- [x] Audit at `roadmap/wave-69-audit.md` with KEEP/REPLACE/DELETE inventory + sequence diagram + post-Wave-68b verification.
- [x] `RepoMap.modules[].structural.exports` is `ModuleExport[]` (not `string[]`); each entry has `name`, `signature` (string or null), `kind` (`'Class' | 'Function' | 'Method'`).
- [x] `enforceSizeCap` Step 3 ranks modules by hotspot score with file-count tiebreaker.
- [x] `crossModuleDependencies` populated via per-source-module batched Cypher queries (Amendment 2 — single-query path infeasible due to LIMIT 200 cap and missing GROUP BY).
- [x] `repoMapBudgets.ts` exists; `generateRepoMap` and `injectContextLayer` accept optional `model`; behavior verified per tier.
- [x] Files deleted: `importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`, plus their test. `applyImportAnalysis` and `applyGraphAnalysis` removed from `contextLayerControllerSupport.ts`. `maybeRunGraphAnalysis` removed from `contextLayerRefresher.ts`.
- [x] Files relocated (Amendment 1): `languageStrategies.ts` and `languageStrategiesSupport.ts` (+ test) moved to `orchestration/`. `repoIndexerHelpers.ts` import path updated.
- [x] Soft-fallback verified: with `getGraphController()` mocked to return null, `generateRepoMap` produces a non-throwing repo map with `ModuleExport[]`-shaped exports (signature: null).
- [x] `npx vitest run src/main/contextLayer/ src/main/orchestration/` — **1152 / 1152 pass.**
- [x] `npx tsc --noEmit -p tsconfig.node.json` — clean.
- [x] `npx eslint` — clean on touched files.
- [ ] **Manual smoke entry signed below** (user — see "Manual smoke gate" section).
- [ ] **Live `.context/repo-map.json` inspection** (user — see verification probes).

## Manual smoke gate

Wave 69 does not touch `src/renderer/components/Layout/**` so the global UI manual-smoke rule does not strictly apply. The plan's Phase F still calls for a runtime sanity check. Suggested checklist:

```
- [ ] Restart the IDE so the rebuilt main process loads the Wave 69 code.
- [ ] Open the project; let the context-layer rebuild run on cold start.
- [ ] Inspect .context/repo-map.json — verify modules[i].structural.exports[j].signature is populated for at least 3 modules.
- [ ] Confirm modules[].structural.exports[j] is an object with { name, signature, kind } — not a bare string.
- [ ] Confirm crossModuleDependencies has at least 1 entry with weight > 0.
- [ ] Run a navigation task in the chat agent — eyeball that the first-turn behavior pulls the right modules into context.
- [ ] No console errors on cold boot.
- [ ] Smoke signed: <name> on <YYYY-MM-DD>
```

## Verification probes (run via codemode in a fresh CC session after IDE restart)

```ts
const out = {};

// 1. Repo map populates with the new shape
const repoMap = JSON.parse(await readFile('.context/repo-map.json', 'utf-8'));
out.has_modules = repoMap.modules.length;                   // expect > 0
out.has_signatures = repoMap.modules
  .flatMap((m) => m.structural.exports)
  .filter((e) => e.signature !== null).length;              // expect > 0

// 2. Module ranking order reflects hotspots, not just file count
out.first_module = repoMap.modules[0].structural.module.label;
out.first_module_filecount = repoMap.modules[0].structural.fileCount;
//   (Top module is NOT necessarily the largest by file count)

// 3. Cross-module dependencies populated
out.has_deps = repoMap.crossModuleDependencies.length;       // expect > 0
out.deps_have_weights = repoMap.crossModuleDependencies
  .every((d) => typeof d.weight === 'number' && d.weight > 0);

// 4. Graph-derived data is consistent with graph queries
const arch = await servers.ouroboros.get_architecture({ aspects: ['hotspots'] });
//   Expect: top-ranked module in repo-map.json contains symbols listed in arch.hotspots
```

## Subsystem scope outside Wave 69

The following test failures were observed in the full repo `vitest` run but exist in working-tree files **not touched by Wave 69**:

- `src/renderer/styles/mobile-touch-targets.test.ts` — button height check
- `src/main/mobileAccess/channelCatalogCoverage.test.ts` — channel catalog coverage
- `src/renderer/components/Layout/TitleBar.menus.test.ts` — "Switch to IDE Shell" menu item
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchFollowThrough.integration.test.tsx`
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.integration.test.tsx`

These come from the pre-existing uncommitted modifications to `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx`, `InnerSidebar.tsx`, `monacoVimMode.ts`, `hooks.ts`, `hooksNet.ts`, etc., which were already in the working tree at session start. They are unrelated to Wave 69.

## Notes for future waves

- **Wave 69 / B2 ranking precision.** Per-module COUNT(*) is bounded but coarse — it can't see which inbound edges are particularly load-bearing. A future wave could switch B2 to per-symbol scoring once the cypherEngine grows GROUP BY in RETURN.
- **Audit ESCALATE-2 still applies.** B3 falls back to file-walk when the graph returns no edges. If the graph is healthy but a particular module has > 200 outbound edges, those over the LIMIT are dropped. Acceptable for top-N truncation; revisit if Wave 70 wants tighter coverage.
- **`model:` threading.** The orchestration layer's `enrichPacketWithContextLayer` passes `undefined` for model (default tier) until `TaskRequest` learns to carry the request's target model. That follow-on lives outside Wave 69 per audit Risk #5.
- **`ModuleBoundarySignals` fields on `DetectedModule`** are now zero-initialized and unread. Cleaning up the field is dead-code housekeeping; no impact on behavior.

## Phase ordering executed

```
0 (ADR + 2 amendments) → A (audit) → B1 → B2 → B3 → C → D → E → F (this brief, smoke pending)
```

Sequential within Phase B as required (each B-phase depends on the prior's type changes). C ran after B1. D ran after B-series. E ran after D. No phases parallelized.

## Files touched (high-level)

- **New:** `repoMapGeneratorGraph.ts` + `.test.ts`, `repoMapGeneratorRanking.ts` + `.test.ts`, `repoMapGeneratorDeps.ts` + `.test.ts`, `repoMapBudgets.ts` + `.test.ts`, `repoMapGeneratorFrameworks.ts` + `.test.ts`, `moduleDetectorMatching.ts` + `.test.ts`, `repoMapGenerator.graph.integration.test.ts`, `contextLayerRefresher.test.ts`.
- **Modified:** `repoMapGenerator.ts`, `contextInjector.ts`, `contextLayerController.ts`, `contextLayerControllerSupport.ts`, `contextLayerControllerTypes.ts`, `contextLayerModuleSummary.ts`, `contextLayerRefresher.ts`, `contextLayerTypes.ts`, `moduleDetectorHelpers.ts`, `summarizationQueue.ts`, `repoMapGenerator.test.ts`, `contextInjector.test.ts`, `contextLayer/CLAUDE.md`, `orchestration/typesContext.ts`, `orchestration/repoIndexerHelpers.ts`, `shared/types/orchestrationContext.ts`.
- **Deleted:** `importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`, `importGraphAnalyzer.test.ts`.
- **Relocated:** `languageStrategies.ts`, `languageStrategiesSupport.ts`, `languageStrategies.test.ts` → `orchestration/`.

Net subsystem deletion: ~600 source lines + ~100 test lines (matched the wave plan's "half the value" line item).
