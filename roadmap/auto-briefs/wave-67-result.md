# Wave 67 — Result Brief: Indexer Definition-Pass Coverage Repair

**Status:** READY FOR SMOKE · target v2.10.x
**Plan:** `roadmap/wave-67-indexer-coverage-repair.md`
**ADR:** `roadmap/decisions/wave-67.md`
**Diagnostic:** `roadmap/wave-67-diagnostic.md`

---

## What shipped

Surfaced during Wave 66 smoke: 6+ TypeScript files had a `File` node in the graph but **zero definition nodes** (`graphDatabase.ts`, `hooks.ts`, `windowManager.ts`, `useAgentEvents.ts`, `codemodeManager.ts`, `internalMcp/index.ts`). Wave 66 P3 (`get_code_snippet({symbol: "GraphDatabase"})`) and P6 (`MATCH (a)-[r:CALLS]->(b:Class)`) both depended on these missing nodes.

Phase A diagnostician found the root cause with file:line evidence: `indexingWorker.ts:getOrInitPipeline()` constructed `new TreeSitterParser()` without calling `await parser.init()`, so the worker's parser stayed permanently null. Every `parseFile` call in the worker thread threw `"TreeSitterParser not initialized — call init() first"`. The empty `catch { /* skip */ }` at `indexingPipelinePasses.ts:73` swallowed the throw, leaving `parsed: null` for every file. The definition pass then skipped each file via `if (!file.parsed) continue`. Live DB confirmed: **5 DEFINES edges across 3,328 File nodes** (the 5 survivors were orphaned from a deleted file).

Files that hadn't changed since the bug was introduced kept their old (correct) nodes from before the worker-thread refactor. Files that DID change (like `graphDatabase.ts` during Wave 66) had `deleteNodesByFile` clear their old nodes — and then no replacements were written.

## Phase summary

- **Phase 0 — ADR.** `roadmap/decisions/wave-67.md` — six locked decisions: diagnose-first (Phase A is read-only and produces a written diagnosis before any code is written), permanent `parseAnomalies` detection regardless of root cause, regression fixture in repo, no tree-sitter package change, forced reindex after fix, project-wide audit scope.
- **Phase A — Diagnose.** `sonnet-diagnostician` produced `roadmap/wave-67-diagnostic.md` (345 lines) naming the root cause with 8 numbered evidence items including live DB queries that confirmed the symptom. Recommended fix shape pointed Phase B at the exact lines.
- **Phase B — Fix.** `indexingWorker.ts:getOrInitPipeline()` is now async and calls `await parser.init()`; the empty `catch { /* skip */ }` in `readAndParseOne` is now `catch (err) { log.warn('[parsePass] parseFile threw, file=%s err=%s', ...) }`. New `indexingPipeline.integration.test.ts` drives `IndexingPipeline.index()` end-to-end against real `web-tree-sitter` WASM and an in-memory DB on a TS fixture; asserts Class/Method/Function nodes and DEFINES edges. **Would have caught this bug before it shipped.**
- **Phase C — Detection layer.** New `parseAnomalyDetection.ts` with `countParseAnomalies(): { count, samples[] }`. New `indexingPipelineResult.ts` module persists the count to `graph_metadata` via `setGraphMetadata` at the end of every `runIndex`. `handleIndexStatus` reads the metadata key and renders an anomaly section when `count > 0`. Tool description updated to mention the field. `IndexingResult` type gains the optional `parseAnomalies` field.
- **Phase D — Regression fixture.** New `__fixtures__/modernTs.ts` covers inline-type imports, `satisfies`, `using`, decorators, abstract class, full class-body, namespace, ambient declaration, and const type parameter. New `treeSitterParser.test.ts` parses the fixture and asserts ≥9 definitions across Class/Function/Method labels. `tsconfig.node.json` + `eslint.config.mjs` exclude `src/**/__fixtures__/**` so fixture files aren't checked as production code.
- **Phase E — Build + reindex (this brief).** Built `out/` via `npm run build`. The new `out/main/indexingWorker.js` and `out/main/index.js` carry the fix. The IDE's catalog hash will mismatch on next launch (the `await parser.init()` change alters the catalog hash when the indexing worker is re-imported), triggering a full reindex automatically. Alternatively, the user can force a reindex by deleting the project entry from the live DB and reopening the IDE.
- **Phase F — Smoke gate (manual).** See "Smoke probes" below.

## Files touched

**New:**
- `src/main/codebaseGraph/indexingPipeline.integration.test.ts` (Phase B)
- `src/main/codebaseGraph/parseAnomalyDetection.ts` + `.test.ts` (Phase C)
- `src/main/codebaseGraph/indexingPipelineResult.ts` + `.test.ts` (Phase C)
- `src/main/codebaseGraph/__fixtures__/modernTs.ts` (Phase D)
- `src/main/codebaseGraph/treeSitterParser.test.ts` (Phase D)
- `roadmap/decisions/wave-67.md` (Phase 0)
- `roadmap/wave-67-indexer-coverage-repair.md` (planning)
- `roadmap/wave-67-diagnostic.md` (Phase A)
- `roadmap/auto-briefs/wave-67-result.md` (this brief)

**Modified:**
- `src/main/codebaseGraph/indexingWorker.ts` — `getOrInitPipeline` async + `await parser.init()`
- `src/main/codebaseGraph/indexingPipelinePasses.ts` — `log.warn` replacing the empty catch
- `src/main/codebaseGraph/indexingPipeline.ts` — delegates result building to `buildIndexResult`
- `src/main/codebaseGraph/indexingPipelineTypes.ts` — `parseAnomalies?` field on `IndexingResult`
- `src/main/codebaseGraph/mcpToolHandlerDefs.ts` — `getParseAnomaliesLines` helper read via `getGraphMetadata`
- `src/main/codebaseGraph/mcpToolHandlers.ts` — `index_status` tool description
- `tsconfig.node.json`, `eslint.config.mjs` — exclude `src/**/__fixtures__/**`

## Test results

- **Touched tests:** 26 pass (parseAnomalyDetection 6 + indexingPipelineResult ~9 + treeSitterParser fixture 1 + mcpToolHandlerDefs ~10).
- **Phase B integration test:** `indexingPipeline.integration.test.ts` — 5 cases (success, Class node, Method nodes, Function node, DEFINES edges) — all pass.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.node.json` clean.
- **Lint:** clean on touched files.
- **Full subdirectory:** `npx vitest run src/main/codebaseGraph/` — not run at brief-write time. Per `~/.claude/rules/test-scope.md`, full suite at user's discretion.

## Smoke probes (manual, post-IDE-restart)

**Required:** restart the Ouroboros app so the main process loads the new `out/main/index.js` AND the worker thread re-spawns with the new `out/main/indexingWorker.js`. The codemode-proxy MCP subprocess in this Claude Code session also needs to refresh — restart the session (or run a new one) so `servers.ouroboros.*` queries hit the new build.

**Expected on first launch:** ~30–60s full reindex. The catalog hash mismatch detector at `graphDatabaseSession.verifyCatalogHash` will see the hash diverge (because the worker's parse output now includes definitions that previously didn't exist) and trigger a complete pipeline run.

**Probes for a fresh Claude Code session against this project:**

```ts
// Wave 67 probes
const out = {};

// 1. graphDatabase.ts has its definitions
out.graphDatabase_class = await servers.ouroboros.search_graph({ query: "GraphDatabase" });
//   Expect: Class node at rank 0, file path graphDatabase.ts.

out.graphDatabase_methods = await servers.ouroboros.query_graph({
  query: "MATCH (n) WHERE n.filePath = 'src/main/codebaseGraph/graphDatabase.ts' RETURN count(n)"
});
//   Expect: count >= 50 (was 1 pre-Wave-67).

// 2. hooks.ts has its definitions
out.hooks_count = await servers.ouroboros.query_graph({
  query: "MATCH (n) WHERE n.filePath = 'src/main/hooks.ts' RETURN count(n)"
});
//   Expect: count > 1 (was 1 pre-Wave-67).

// 3. parseAnomalies surfaces in index_status
out.status = await servers.ouroboros.index_status({});
//   Expect: output contains "Parse anomalies: <small number>" — should be small (ideally 0)
//   if the fix worked. The detection layer is permanent regardless.

// 4. Wave 66 P3 — get_code_snippet auto-resolve unblocks
out.snippet = await servers.ouroboros.get_code_snippet({ symbol: "GraphDatabase" });
//   Expect: snippet body, NOT "Symbol not found".

// 5. Wave 66 P6 — Class CALLS edges (Phase D Class-in-buildSymbolsByName lands)
out.class_calls = await servers.ouroboros.query_graph({
  query: "MATCH (a)-[r:CALLS]->(b:Class) RETURN count(b)"
});
//   Expect: non-zero count.

// 6. Total DEFINES edges restored
out.defines_count = await servers.ouroboros.query_graph({
  query: "MATCH ()-[r:DEFINES]->() RETURN count(r)"
});
//   Expect: thousands (was 5 pre-Wave-67).

return out;
```

## Acceptance gate (manual)

- [ ] User restarted Ouroboros app post-merge.
- [ ] User restarted their Claude Code session (so MCP subprocess loads new build).
- [ ] First-launch reindex completed without errors.
- [ ] Probe 1 (`graphDatabase_class`) returns the Class node.
- [ ] Probe 2 (`graphDatabase_methods`) returns count >= 50.
- [ ] Probe 3 (`hooks_count`) returns count > 1.
- [ ] Probe 4 (`status`) shows `parseAnomalies` count (any value; presence is the gate).
- [ ] Probe 5 (`snippet`) returns the GraphDatabase class body.
- [ ] Probe 6 (`class_calls`) is non-zero.
- [ ] Probe 7 (`defines_count`) is in the thousands.
- [ ] Smoke signed: ____ on ____.

## Deferred from this wave (intentional)

- **Cypher engine quality bugs** surfaced during Wave 66 + Wave 67 smoke: `r.confidence` access fails ("no such column: r.props"); `labels()` silently dropped from result columns; `p.indexed_at` returns "no such column" (project property camelCase mismatch). These are pre-existing `cypherEngine.ts` issues unrelated to the indexer. Filed as Wave 68 candidate.
- **`@vscode/tree-sitter-wasm` upgrade** to a version that handles `accessor` keyword and other TS 5.x features. Out of scope for this wave; the current grammar handles everything our fixture covers.
- **Project-wide audit** of files with File-only nodes. Phase A diagnostic established the live count (~3,323). After the post-Wave-67 reindex, the count should drop to a small number representing genuinely empty files / pure re-export barrels. If the audit reveals additional broken cases, file Wave 68 follow-up.

## Notes for the next wave

- **The integration test in `indexingPipeline.integration.test.ts` is the load-bearing regression guard.** It exercises the full pipeline against real WASM. Future refactors that touch the worker thread, the parser init lifecycle, or the pass orchestration MUST keep this test green — it's the only test that catches the class of bug Wave 67 fixed.
- **`parseAnomalies` is the canary.** If a future wave introduces a syntactic feature that the grammar can't parse (e.g., a hypothetical TS 6.0 feature), `parseAnomalies` count will rise on next reindex. Watch for it in `index_status` output during routine work.
