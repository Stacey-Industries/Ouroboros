# Wave 69 — Context-Layer Graph Integration

## Status

DRAFT · target v2.10.x · follows Wave 68 (cypherEngine quality repair). Drafted 2026-05-01.

## Context — why this wave exists

Waves 67 and 68 brought the codebase-memory graph from "5 DEFINES edges across 3,328 files" (effectively unusable) to **18,277 DEFINES edges plus a fully queryable Cypher surface** with project scoping, target-label filters, anonymous endpoints, `labels()`, relationship-property access, and Project routing all working. The graph now exposes:

- Per-symbol nodes (Class, Function, Method, Interface, Type, Enum) with `name`, `filePath`, `startLine`, `props.signature`
- Per-edge relationships (CALLS, IMPORTS, DEFINES) with confidence scores
- `QueryEngine.computeHotspots()` — PageRank-equivalent inbound-degree scoring over Function + Method nodes
- Stable consumer API via `GraphControllerLike` (`getGraphController()`, `getArchitecture`, `queryGraph`, `searchGraph`, `getCodeSnippet`)

The contextLayer (`src/main/contextLayer/`) builds the repo map injected into every IDE chat-agent session. It was written before the graph was usable, so it does its own file walks, its own per-language import extraction (`languageStrategies.ts`, 10 languages, ~600 lines across two files), its own import-graph clustering (`importGraphAnalyzer.ts` + support, ~350 lines), and its own ranking (file count + binary recency). Output is strictly weaker than what the graph provides:

- **Module exports are name-only** — `["FileTree", "anthropicAuth"]`. Models cannot infer signatures from names.
- **Ranking by `fileCount`** — a 12-file utility ranks above a 4-file architectural backbone.
- **Hardcoded 8 KB cap** — wastes Opus headroom; doesn't scale by model.
- **Two import-resolution paths** — contextLayer's drifts whenever the graph improves.

Wave 69 makes the contextLayer a graph consumer. It does not redesign the contextLayer's goal-conditioned selection (`contextInjector.selectRelevantModules`), AI summarization (`contextLayerAiSummarizer.ts`), or per-module file storage (`.context/modules/*.json`) — those are the contextLayer's load-bearing original contributions. What changes is the per-module *content*, not the per-module *identity*.

### What's been confirmed before drafting

- `getNodeSignature` in `queryEngineSupport.ts:49` reads `node.props.signature` — signatures ARE stored as JSON properties on every Class / Function / Method node post-Wave-67.
- `QueryEngine.computeHotspots()` (`queryEngine.ts:327`) scores Function + Method nodes by inbound CALLS edges; identical surface as Aider's PageRank output for this graph shape.
- `query_graph` (Cypher) supports target-label filters, anonymous endpoints, `labels()`, and relationship-property access via `r.confidence` post-Wave-68.
- `GraphControllerLike` is the stable consumer API; null is a valid return during the graph startup window — soft fallback is required (Decision 7).

### Companion bugfix landed before this wave

A small contextLayer init bug ("`initContextLayer` called with empty `defaultProjectRoot` writes a corrupt `.context/repo-map.json` that subsequent real-root inits load instead of rebuilding") landed in the same session this plan was drafted. Wave 69 assumes the on-disk repo map populates correctly post-bugfix; if Phase A finds the file is still empty after a fresh launch, that's a regression of the bugfix and Wave 69 stops until it's understood.

## Goal

The contextLayer's repo map is built from graph queries. Module exports include signatures. Module ranking comes from hotspot scores. Cross-module dependencies come from CALLS + IMPORTS edges. Token budget scales by model. The four redundant subsystems (`importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`, `languageStrategies.ts`, `languageStrategiesSupport.ts`) are deleted. The contextLayer is meaningfully smaller and produces meaningfully richer output.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/decisions/wave-69.md`. Seven decisions:

1. **Module identity stays directory-driven.** `moduleDetector.ts` keeps doing what it does. The graph augments per-module *content*, not identity.
2. **Module exports come from the graph with signatures.** `exports: string[]` becomes `exports: ModuleExport[]` with `name`, `signature`, `kind`.
3. **Module ranking comes from graph hotspots.** Replace `fileCount`-based truncation with hotspot-score-based; file count becomes a tiebreaker only.
4. **Cross-module dependencies come from CALLS + IMPORTS edges.** Delete `importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`, `languageStrategies.ts`, `languageStrategiesSupport.ts` (~600 lines).
5. **Token budget becomes model-aware.** New `repoMapBudgets.ts` table: Opus 16 KB / 4K tokens, Sonnet 12 KB / 3K, default 8 KB / 2K.
6. **`contextInjector` goal-conditioned selection stays.** Inputs change; selection logic does not.
7. **Graph-not-ready is a soft fallback.** Repo map degrades to structural-skeleton-only when the graph is unavailable; refreshes automatically once it populates.

## Scope

**In scope:**
- Replace `repoMapGenerator.ts:generateRepoMap` body with a graph-backed builder (Phases B1, B2, B3)
- Add `ModuleExport` type with `name`, `signature`, `kind` (Phase B1)
- Add `repoMapBudgets.ts` model-aware budget table (Phase C)
- Update `enforceSizeCap` to rank by hotspot score (Phase B2)
- Delete the four redundant subsystems (Phase D)
- Soft-fallback path when graph is unavailable (Phase B1)
- Per-phase regression and integration tests
- Smoke fixture covering: signatures, hotspot ranking, model budget tiers, graph-not-ready fallback

**Out of scope:**
- Task-type-aware ranking (Item 6 — deferred per `roadmap/deferred-task-type-aware-ranking.md`)
- Git-frequency importance signal (Item 4 — deferred; reconsider after Wave 69 settles)
- Replacing `moduleDetector.ts` (Decision 1 — directory-driven module identity stays)
- AI summarizer changes (`contextLayerAiSummarizer.ts` continues to work as a decorative layer)
- Schema migration for old `.context/modules/*.json` files (the GC pass reconciles by writing fresh entries)
- Any `treeSitterParser` / indexer changes (graph is the source of truth post-Wave-67)
- Any `GraphControllerLike` API changes (the consumer surface is stable post-Wave-66)

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | ADR | sonnet-implementer | Already written: `roadmap/decisions/wave-69.md`. Verify before dispatching A. |
| A | Audit + integration design | **sonnet-architect** | Read-only. Walk every file in `src/main/contextLayer/` and label each function/symbol: KEEP / REPLACE-WITH-GRAPH / DELETE / NO-CHANGE. Output: `roadmap/wave-69-audit.md` with the inventory + a sequence diagram of the new graph-backed `generateRepoMap` flow. Identify any `GraphControllerLike` method gaps (where Cypher would need a query the engine can't yet express) and flag them. **Phase B does not start until orchestrator reviews this audit.** |
| B1 | Graph-backed export queries | sonnet-implementer | Add `ModuleExport` type. Implement `queryModuleExports(moduleRootPath, projectName)` in new `repoMapGeneratorGraph.ts`: returns `Array<{name, signature, kind}>` via Cypher. Plumb into `repoMapGenerator.generateRepoMap` replacing the `exports: string[]` field with `exports: ModuleExport[]`. Update `RepoMap`, `ModuleContextEntry`, `RepoMapSummary` types. Soft-fallback when `getGraphController()` returns null: keep names, omit signatures. |
| B2 | Hotspot-derived ranking | sonnet-implementer | Add `computeModuleHotspotScore(modulePath, hotspots)` in `repoMapGeneratorRanking.ts` — sums hotspot scores of nodes whose `filePath` starts with the module's `rootPath`. Update `enforceSizeCap` Step 3 to sort by hotspot score (desc) with `fileCount` tiebreaker. Consume `getArchitecture(['hotspots'])` once per `generateRepoMap` call (not per module). |
| B3 | Graph-derived cross-module deps | sonnet-implementer | Replace `buildCrossModuleDependencies` body with a single Cypher query that returns IMPORTS + CALLS counts grouped by module-pair. Soft-fallback to empty array when graph unavailable. Old function signature preserved so callers don't change. Add `importedFrom: string[]` to `ModuleContextEntry` for the inbound-edge view. |
| C | Model-aware token budget | haiku-implementer | New `repoMapBudgets.ts`: lookup table keyed by model string returning `{ rawCapBytes, injectionTokenCap }`. Replace hardcoded `REPO_MAP_SIZE_CAP_BYTES` and `MAX_TOTAL_INJECTION_TOKENS` constants. `generateRepoMap` and `injectContextLayer` gain a `model: string` parameter. Tests cover: known model returns correct tier, unknown model falls through to default, missing model parameter falls through to default. |
| D | Delete redundant subsystems | sonnet-implementer | Delete `importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`, `languageStrategies.ts`, `languageStrategiesSupport.ts`, and their `.test.ts` files. Remove `applyImportAnalysis` and `applyGraphAnalysis` from `contextLayerControllerSupport.ts`. Remove the `Option B / Option C` references from `contextLayerController.ts` and the subsystem `CLAUDE.md`. Verify no other module imports the deleted files. Run typecheck + lint to confirm no orphaned references. Net deletion: ~600 lines of source + ~400 lines of tests. |
| E | Smoke fixture + regression tests | haiku-test-author | New `repoMapGenerator.graph.integration.test.ts`: in-memory graph DB seeded with a fixture project (3 modules, 5 classes, 8 functions, known CALLS edges); assert `generateRepoMap` output has signatures populated, hotspot-ranked module order, correct cross-module deps, model-aware truncation triggers at the right size for each model tier. New `repoMapGenerator.fallback.test.ts`: graph returns null → assert soft-fallback produces structural-skeleton-only repo map without throwing. |
| F | Manual smoke + result brief | orchestrator | Restart IDE, verify `.context/repo-map.json` populates with the new shape (signatures present, hotspot-ranked modules), confirm subjective improvement in agent's first-turn behavior on a navigation task, sign smoke checklist in `roadmap/auto-briefs/wave-69-result.md`. |

### Phase ordering

```
0 → A → B1 → B2 → B3 → C → D → E → F
                                    ↑
            (E may run in parallel with D after B1+B2+B3 complete)
```

- Phase A blocks B / C / D / E. Until the audit is complete and the orchestrator has reviewed it, no code changes.
- B1 / B2 / B3 are sequential within Phase B because each depends on the prior's type changes flowing through. They are NOT parallel.
- C can run after B1 (it needs the new types) but does not need B2 or B3 to land first.
- D MUST come after B1+B2+B3 — deleting `languageStrategies.ts` breaks the old `applyImportAnalysis` codepath, which is being replaced in B3.
- E runs in parallel with D once B-series completes (the fixture exercises the new path; D removes the old path; both are safe simultaneously if E doesn't import anything D deletes).
- F is the wave wrap.

## Risks

| Risk | Mitigation |
|---|---|
| Graph's `props.signature` is missing for some node types (e.g., Type, Enum, Interface) | Phase A audit explicitly checks coverage. If gaps exist, fall back to name-only for those kinds; do not silently skip. Filed as Wave 70 candidate if widespread. |
| Cypher engine can't express the cross-module deps query efficiently | Phase A pre-flight checks the query against the live graph. If the engine times out or returns wrong results, B3 falls back to per-pair queries (slower, correct) and a Wave 70 cypherEngine perf wave is filed. |
| Hotspot computation includes too few modules (some modules have only Type / Interface nodes, no Functions) | Tiebreaker is `fileCount`. Modules with zero hotspot score still get ranked — just below modules with non-zero. Documented in Decision 3. |
| Soft-fallback fires for so long that users never see signatures populate | Add log + telemetry when fallback fires. If fallback rate > 10% of generation calls in production, file a graph-startup-readiness wave. |
| Deletion (Phase D) breaks something that imports `languageStrategies.ts` outside `contextLayer/` | Phase D's first action is `Grep` across `src/` for any import of the deleted modules. If any exist outside the deletion set, file a sub-task before deleting. |
| `repo-map.json` schema change breaks existing on-disk data | The GC pass reconciles by writing fresh entries. Old format is dropped; no migration needed. Acceptable because the on-disk format is internal (no external consumers). |
| `model: string` parameter threading through `generateRepoMap` callers requires too many touch points | Phase A inventories every caller. If > 5, switch the budget lookup to read from a session-scoped registry rather than per-call parameter. Decision 5 leaves this open. |
| Wave 69 increases per-turn latency (graph queries on every refresh) | Cache hotspot results for the duration of one `generateRepoMap` call (single `getArchitecture` call instead of N). Cypher queries for cross-module deps batch into one query, not per-pair. Phase E's integration test asserts wall-clock time is within 2x of pre-Wave-69. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | n/a | Manual review of `roadmap/wave-69-audit.md` | Audit is the deliverable, not tests |
| B1 | `queryModuleExports` against an in-memory graph fixture; ModuleExport type validation | One-module end-to-end: input graph + module path → output ModuleExport[] with signatures | Soft-fallback test: null graph → name-only output |
| B2 | `computeModuleHotspotScore` with synthetic hotspot data | Multi-module repo map generation with mocked graph; assert ranking order matches hotspot scores | Tiebreaker test: equal scores → file count decides |
| B3 | Cross-module deps query result aggregation | Two-module fixture with known IMPORTS + CALLS edges → assert correct weight | Soft-fallback: graph null → empty deps array |
| C | Budget lookup for each known model + unknown fallback + missing parameter | `generateRepoMap` with each model tier produces appropriately-sized output | Tier transitions trigger different truncation behavior |
| D | n/a | Typecheck + lint pass after deletion | Smoke test: subdirectory tests still pass |
| E | n/a | Full graph-backed integration test against fixture project | Regression: pre-Wave-69 behavior with graph-disabled flag still works |
| F | n/a | Manual smoke checklist | Live IDE behavior |

## Acceptance criteria

- [ ] ADR at `roadmap/decisions/wave-69.md` with all 7 decisions. **Already written.**
- [ ] Audit at `roadmap/wave-69-audit.md` (Phase A deliverable) with per-symbol KEEP/REPLACE/DELETE labels and a sequence diagram of the new flow.
- [ ] `RepoMap.modules[].structural.exports` is `ModuleExport[]` (not `string[]`); each entry has `name`, `signature` (string or null), `kind` ('Class' | 'Function' | 'Method').
- [ ] `enforceSizeCap` ranks modules by hotspot score with file-count tiebreaker.
- [ ] `crossModuleDependencies` populated via single Cypher query (or batched queries) — verified by inspecting query call count in tests.
- [ ] `repoMapBudgets.ts` exists; `generateRepoMap` and `injectContextLayer` accept `model: string`; behavior verifies per tier.
- [ ] Files deleted: `importGraphAnalyzer.ts`, `importGraphAnalyzerSupport.ts`, `languageStrategies.ts`, `languageStrategiesSupport.ts`, plus their tests. `applyImportAnalysis` and `applyGraphAnalysis` removed from `contextLayerControllerSupport.ts`.
- [ ] Soft-fallback verified: with `getGraphController()` mocked to return null, `generateRepoMap` produces a non-throwing structural-skeleton-only repo map.
- [ ] `npx vitest run src/main/contextLayer/` passes (full subdirectory).
- [ ] `npx tsc --noEmit -p tsconfig.node.json` clean.
- [ ] `npm run lint` clean on touched files.
- [ ] Manual smoke entry signed in `roadmap/auto-briefs/wave-69-result.md` with a probe-set output (see Verification below).
- [ ] After IDE restart, live `.context/repo-map.json` shows: non-empty `workspaceRoot`, `moduleCount > 0`, `modules[i].structural.exports[j].signature` populated for at least 3 modules.

## Verification

After Phase F's IDE restart, run these probes via codemode in a fresh CC session:

```ts
const out = {};

// 1. Repo map populates with the new shape
const repoMap = await readFile(path.join(workspaceRoot, '.context', 'repo-map.json'));
const parsed = JSON.parse(repoMap);
out.has_modules = parsed.modules.length;                  // expect > 0
out.has_signatures = parsed.modules
  .flatMap((m) => m.structural.exports)
  .filter((e) => e.signature !== null)
  .length;                                                 // expect > 0

// 2. Module ranking order matches hotspot scores
out.first_module = parsed.modules[0].structural.module.label;
out.first_module_filecount = parsed.modules[0].structural.fileCount;
//   Expect: first module is NOT necessarily the largest by file count

// 3. Cross-module dependencies populated
out.has_deps = parsed.crossModuleDependencies.length;     // expect > 0
out.deps_have_weights = parsed.crossModuleDependencies
  .every((d) => typeof d.weight === 'number' && d.weight > 0);

// 4. Graph-derived data is consistent with graph queries
const arch = await servers.ouroboros.get_architecture({ aspects: ['hotspots'] });
const archHotspots = arch.aspects.hotspots;
//   Expect: top-ranked module in repo-map.json contains symbols listed in arch.aspects.hotspots

// 5. Model-aware budget triggers correctly (visible via log inspection or per-model probe)
//   Tested in unit + integration; manual probe optional.
```

Test commands:

```bash
# Per-phase
npx vitest run src/main/contextLayer/repoMapGenerator.test.ts                # B1, B2, B3
npx vitest run src/main/contextLayer/repoMapBudgets.test.ts                  # C
npx vitest run src/main/contextLayer/repoMapGenerator.graph.integration.test.ts  # E
npx vitest run src/main/contextLayer/repoMapGenerator.fallback.test.ts       # E
npx vitest run src/main/contextLayer/                                        # wrap

# Wave wrap (Phase F):
npm run lint
npx tsc --noEmit
```

## Files the next agent should read first

1. `roadmap/decisions/wave-69.md` — the seven locked decisions. Don't deviate.
2. `roadmap/deferred-task-type-aware-ranking.md` — what's intentionally NOT in this wave.
3. `roadmap/auto-briefs/wave-67-result.md` and `roadmap/auto-briefs/wave-68-result.md` — what the graph can do post-fix. Recent.
4. `src/main/contextLayer/repoMapGenerator.ts` — the file being substantially rewritten. Read end-to-end.
5. `src/main/contextLayer/contextInjector.ts` — what stays unchanged. Reference for what NOT to touch.
6. `src/main/contextLayer/moduleDetector.ts` and helpers — what stays unchanged. Reference.
7. `src/main/contextLayer/contextLayerController.ts` — entry point (`runFullRebuild`). The orchestration that calls `generateRepoMap`.
8. `src/main/contextLayer/CLAUDE.md` — current architecture; will need updating after Phase D.
9. `src/main/codebaseGraph/queryEngine.ts` (`computeHotspots`) — the hotspot signal source.
10. `src/main/codebaseGraph/queryEngineSupport.ts:49` (`getNodeSignature`) — confirms signatures are in `node.props.signature`.
11. `src/main/codebaseGraph/CLAUDE.md` — graph consumer API surface (`GraphControllerLike`).
12. `src/main/orchestration/contextPacketBuilderSupport.ts` (`getModelBudgets`) — the existing model-aware budget pattern Decision 5 mirrors.

## Note to the implementer

This is a *replacement* wave, not a *redesign*. The contextLayer's architecture is correct — directory-driven module detection, goal-conditioned selection, AI summarization as a decorative layer, atomic per-module storage. What's wrong is *what data fills those slots*. The current generator infers data heuristically from raw files; the new generator queries the graph that already has it.

Resist the urge to:
- Rewrite `moduleDetector.ts` to use graph clustering (Decision 1 says no — directory identity is the right shape).
- "Improve" `contextInjector.selectRelevantModules` while you're in there (Decision 6 says no — it's not duplicated by the graph; leave it alone).
- Add task-type-aware ranking (Item 6 — deferred for evidence-driven evaluation, not a Wave 69 sub-task).
- Migrate the old `.context/modules/*.json` schema (the GC reconciles; no migration needed; don't write a migration tool).
- Build a fallback that re-implements signature extraction without the graph (the soft-fallback is name-only, by design — name-only is what the current generator already does).

The deletion in Phase D is half the value of this wave. ~600 lines of source go away because the work is now done elsewhere. If Phase D ends with files still containing duplicated logic, the wave isn't complete.

## Orchestrator dispatch checklist

1. Verify Phase 0 — ADR is written: `roadmap/decisions/wave-69.md` exists. **Already done.**
2. Dispatch Phase A → **sonnet-architect** (read-only) to produce `roadmap/wave-69-audit.md`. Audit must include: (a) per-symbol KEEP/REPLACE/DELETE inventory, (b) a sequence diagram of the new graph-backed flow, (c) any `GraphControllerLike` API gaps flagged.
3. Orchestrator reviews the audit. If any audit item conflicts with a locked decision, audit wins on facts but decisions win on direction — escalate to user.
4. Dispatch Phase B1 → sonnet-implementer with the audit as input. Acceptance: `ModuleExport` type added, `queryModuleExports` works, soft-fallback verified, types consistent across `RepoMap` and `ModuleContextEntry`.
5. Dispatch Phase B2 → sonnet-implementer. Acceptance: hotspot ranking changes truncation order on a fixture with known scores.
6. Dispatch Phase B3 → sonnet-implementer. Acceptance: cross-module deps populated via Cypher; query call count is bounded (single batched query preferred).
7. Dispatch Phase C → haiku-implementer. Acceptance: `repoMapBudgets.ts` exists; `generateRepoMap` and `injectContextLayer` accept `model` param; tier behavior tested.
8. Dispatch Phase D → sonnet-implementer. Acceptance: four files deleted; no orphaned imports; typecheck + lint clean.
9. Dispatch Phase E → haiku-test-author (parallel-safe with D after B-series complete). Acceptance: graph-backed integration test passes; soft-fallback test passes.
10. Phase F: orchestrator restarts IDE, runs verification probes, signs smoke checklist, writes `roadmap/auto-briefs/wave-69-result.md`.
11. Final: `timeout 360 npx vitest run src/main/contextLayer/` + `npm run lint` + `npx tsc --noEmit -p tsconfig.node.json`.

## Estimated effort

Per-phase rough estimate (for planning, not commitment):

- Phase A: 30–45 min (read-only architect)
- Phase B1: 90 min (new types + Cypher query + plumbing + tests)
- Phase B2: 60 min (hotspot aggregation + ranking change + tests)
- Phase B3: 60 min (Cypher query + dep aggregation + tests)
- Phase C: 30 min (table + parameter threading + tests)
- Phase D: 45 min (deletion + verifying no orphans + CLAUDE.md update)
- Phase E: 45 min (fixture + integration test + fallback test)
- Phase F: 30 min (smoke + result brief)

Total: ~6.5 hours of agent time, roughly the same shape as Wave 67 / 68. Sequential within Phase B; D and E can parallelize. Plan for one full session.
