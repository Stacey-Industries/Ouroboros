# Wave 67 — Indexer Definition-Pass Coverage Repair

## Status

DRAFT · target v2.10.x · follows Wave 66 (graph MCP tool surface repair). Discovered during Wave 66 smoke testing.

## Context — why this wave exists

A subset of source files have **a File node in the codebase graph but zero definition nodes**. These files are silently absent from the symbol graph: `get_code_snippet`, `search_graph` for symbols defined in them, and any call-graph trace that would touch them all return empty. Wave 66 surfaced this via the smoke probe `get_code_snippet({symbol: "GraphDatabase"})` — the class is in `src/main/codebaseGraph/graphDatabase.ts` line 54, but is missing entirely from the indexed Class label.

Confirmed failing files (likely more — see Phase A audit):
- `src/main/codebaseGraph/graphDatabase.ts` (class `GraphDatabase` + 58 methods/types)
- `src/main/hooks.ts`
- `src/main/windowManager.ts`
- `src/renderer/hooks/useAgentEvents.ts`
- `src/main/codemode/codemodeManager.ts`
- `src/main/internalMcp/index.ts` (the `buildInjectOptions` function)

### What's been ruled out

Diagnostic work this session (Wave 66 smoke session) eliminates the obvious suspects:

1. **The grammar parses correctly.** Both `tree-sitter-wasms@0.1.13` (`tree-sitter-typescript@0.20.5`) and `@vscode/tree-sitter-wasm@0.3.1` produce a clean parse tree for `graphDatabase.ts` — `0 ERROR` nodes, `0 MISSING` nodes, `1 class_declaration` node at line 54 named `GraphDatabase`.
2. **The IDE's `TreeSitterParser.parseFile` works correctly.** Invoking it from vitest against the same file produces 59 valid `ExtractedDefinition` records, with `GraphDatabase` (Class, lines 54-392, isExported: true) as the first.
3. **The migration to `@vscode/tree-sitter-wasm` is already done.** `treeSitterParser.ts` `resolveGrammarPath()` prefers the VS Code package; `tree-sitter-wasms` is a fallback. No package upgrade is required for Wave 67.
4. **Inline-type imports (`import { foo, type Bar }`) don't correlate.** Many files using that syntax index correctly (`threadStoreSqlite.ts`: 34 nodes, `contextLayerController.ts`: 35 nodes, `agentChat.ts`: 21 nodes). Some files NOT using it still fail (`internalMcp/index.ts`).

So the bug is in the **pipeline orchestration between extraction and DB write** — most likely in `parsePass`, `definitionPass`, or the incremental-indexing logic in `indexingPipeline.ts` / `indexingPipelinePasses.ts`. Phase A's job is to identify which step.

### Why this matters

When Wave 66 added new MCP tools, every probe that touched these missing-definition files came back empty. From the agent's perspective, the codebase symbol graph is incomplete in ways that are invisible until you query specifically. Telemetry can't surface this — the tools succeed (return "no results"), they just lie.

## Goal

Every TypeScript/JavaScript source file with at least one top-level definition produces at least one `Function`/`Class`/`Method`/`Interface`/`Type`/`Enum` node in the graph. The pipeline detects and surfaces "parse anomaly" cases (file processed, zero definitions emitted) so the same class of bug can't silently recur.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/decisions/wave-67.md`. Six decisions:

1. **Diagnose first, fix second.** Phase A is non-mutating — instrument the pipeline, reproduce the failure, identify the exact step that drops definitions for affected files. Do not propose a fix until the root cause is named with file:line evidence.
2. **Detection is permanent.** Whatever the root-cause fix turns out to be, the wave also adds a `parseAnomalies` count + sample paths to `index_status` output. Future regressions surface within one reindex cycle instead of needing a smoke test to discover.
3. **Regression-test fixture in repo, not in node_modules.** A `__fixtures__/modernTs.ts` (or similar) covers the syntactic features that have caused parse-output drift — inline-type imports, `satisfies`, `using`, decorators, abstract classes, exported classes with extensive class-body syntax. The test asserts expected node counts. Catches future grammar/orchestration regressions.
4. **No tree-sitter package change.** The package upgrade theory was wrong. `@vscode/tree-sitter-wasm@0.3.1` stays as-is. If post-fix audit reveals a syntactic feature the current grammar can't handle, that's a separate wave.
5. **Forced reindex after fix.** Phase E triggers a full reindex (not incremental) to populate the graph correctly with the corrected pipeline. Catalog hash invalidation alone may not be enough since the pipeline orchestration changes — explicit deletion + reindex is safer.
6. **Audit scope is project-wide.** Phase A counts ALL files with `node_count == 1 (File only)` to bound the blast radius. Wave success requires that count drops to a small, well-explained set (e.g., genuinely empty files, re-export-only barrels with already-counted exported names).

## Scope

**In scope:**
- Identify the orchestration step that drops definitions for affected files (Phase A)
- Fix the orchestration bug (Phase B)
- Add `parseAnomalies` detection to `indexingPipelineSupport.ts` and surface it in `handleIndexStatus` output
- Add a regression-test fixture covering modern TS syntactic features
- Force a fresh reindex post-fix and verify both the originally-failing files AND the Wave 66 P3/P6 probes
- Update `index_status` tool description to document the new field

**Out of scope:**
- Upgrading any tree-sitter grammar or wasm package
- Reformatting source files to "work around" the bug (we fix the indexer, not the inputs)
- Changing the `extractDefinitions` walker semantics
- Other Wave 66 follow-ups (cypherEngine `r.props` access, `labels()` silent drop, Project camelCase mismatch — those go in a separate Wave 68 cypherEngine quality wave)

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | ADR | sonnet-implementer | Capture decisions 1–6 in `roadmap/decisions/wave-67.md`. |
| A | Diagnose root cause | **sonnet-diagnostician** | Read-only investigation. Add temporary log lines, reproduce the indexer run, identify the exact pipeline step that drops the 59 definitions. Output: a written diagnosis at `roadmap/wave-67-diagnostic.md` naming file:line + the proximate cause + the recommended fix shape. **Do not write the fix; write the diagnosis.** |
| B | Implement the fix | sonnet-implementer | Implement what Phase A's diagnosis recommended. Touched files depend on the diagnosis — typical candidates: `indexingPipeline.ts`, `indexingPipelinePasses.ts`, `indexingPipelineIncremental.ts`. Tests confirm the fix on a fixture set. |
| C | Detection layer | haiku-implementer | Add `countParseAnomalies(indexedFiles): number` helper that counts files with `parsed != null && parsed.definitions.length === 0 && lineCount > 30`. Plumb into `IndexingResult.parseAnomalies` and into `handleIndexStatus` output. Update `index_status` tool description. |
| D | Regression fixture | haiku-test-author | New `src/main/codebaseGraph/__fixtures__/modernTs.ts` with each of: inline-type import, `satisfies`, `using`, decorators, abstract class, exported class with full class-body, namespace declaration, ambient declaration. Test in `treeSitterParser.test.ts` parses it and asserts 1 Class + N Methods + correct kinds. |
| E | Forced reindex + audit | sonnet-implementer (orchestrator-validated) | Force a full reindex (`incremental: false`), then audit: query for File nodes with no definitions, compare to pre-wave baseline (~6+ files). Run Wave 66 P3/P6 probes; expect them to pass. |
| F | Manual smoke + result brief | orchestrator | Probe the originally-failing files. Confirm `parseAnomalies` is small. Sign `roadmap/auto-briefs/wave-67-result.md`. |

### Phase ordering

`0 → A → B → C → D → E → F`. Phase A blocks everything: until the cause is named, B, C, D, and E can't proceed. C and D may be parallelizable after A completes if the orchestrator is confident in the diagnosis (C builds detection; D builds the regression fixture; both depend on A's findings but not on each other).

## Risks

| Risk | Mitigation |
|---|---|
| Phase A's diagnosis is wrong | Phase A's deliverable is the written diagnosis with file:line evidence. Orchestrator reviews + sanity-checks before dispatching Phase B. If the diagnosis is shaky, dispatch a second diagnostician for independent verification before Phase B starts. |
| Pipeline fix changes catalog hash → forced reindex regardless | Already in scope. Phase E is the explicit reindex pass. |
| Forced reindex takes >60s on this repo | Acceptable; documented in result brief. The reindex is one-time. |
| The bug is in worker-thread vs main-thread state — not reproducible in vitest | Phase A's diagnostician dispatch is empowered to run the dev IDE manually, attach a debugger, or instrument the worker. Vitest reproduction is a starting point, not a constraint. |
| Detection layer (Phase C) flags too many false positives | Tune the threshold (`lineCount > 30` excludes config/index barrels). Final threshold based on post-fix data. |
| Re-export-only barrel files (`index.ts` files that re-export from siblings) trip the detector | They have zero own-definitions by design. Phase C's detector checks `parsed.exportedNames.length` — if all definitions are re-exports, don't flag. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | n/a | Manual reproduction | Diagnosis output is the deliverable, not tests |
| B | Yes — pipeline-step regression test on a fixture that previously failed | Yes — full pipeline run on a small fixture project; confirms expected node counts | Tests must include a file matching the affected-file pattern |
| C | Yes — `countParseAnomalies` helper across edge cases (empty file, comments-only, single-import re-export, real source) | No | Pure helper |
| D | Yes — fixture parses and produces expected nodes for each modern TS feature | Yes — full pipeline run on the fixture; confirms it indexes correctly | Catches grammar regressions |
| E | n/a | Yes — reindex this project, query for File-only nodes, assert count is small | Validates fix on real data |
| F | n/a | Manual smoke checklist | Runs Wave 66 probes |

## Acceptance criteria

- [ ] ADR at `roadmap/decisions/wave-67.md` with all 6 decisions.
- [ ] Diagnostic at `roadmap/wave-67-diagnostic.md` names the orchestration bug with file:line evidence.
- [ ] After fix + reindex, `MATCH (f:File) WHERE f.filePath = 'src/main/codebaseGraph/graphDatabase.ts' RETURN count((f)) + count{ (f)-[:DEFINES]->() } > 1` (i.e., file has at least one DEFINES edge).
- [ ] `get_code_snippet({symbol: "GraphDatabase"})` returns the class snippet (Wave 66 probe P3).
- [ ] `MATCH (a)-[r:CALLS]->(b:Class) RETURN count(b)` is non-zero (Wave 66 probe P6 — depends on Wave 66's Phase D `Class`-in-`buildSymbolsByName` change actually populating constructor edges, which it should once the affected files are properly extracted).
- [ ] `index_status` output includes a `parseAnomalies` field with the count + up to 5 sample paths.
- [ ] Regression fixture passes; covers ≥6 modern TS syntactic features.
- [ ] Project-wide audit: `MATCH (f:File) WHERE NOT exists { (f)-[:DEFINES]->() } AND f.lineCount > 30 RETURN count(f)` is < 5 (or a documented set with explanations).
- [ ] `npm test` (touched test files only — full suite at user's discretion) passes.
- [ ] Manual smoke entry signed in `roadmap/auto-briefs/wave-67-result.md`.

## Verification

```ts
// Post-fix probes via codemode proxy:

// 1. The originally-failing files now have definitions
await servers.ouroboros.search_graph({ query: "GraphDatabase" });
//   Expect: Class node at rank 0, file path graphDatabase.ts.

await servers.ouroboros.get_code_snippet({ symbol: "GraphDatabase" });
//   Expect: snippet body, not "Symbol not found".

await servers.ouroboros.search_graph({ query: "buildInjectOptions" });
//   Expect: Function node from src/main/internalMcp/index.ts.

// 2. parseAnomalies surfaced in status
await servers.ouroboros.index_status({});
//   Expect: output contains "Parse anomalies: <small number>"

// 3. Wave 66 P6 probe — Class CALLS edges (depends on properly indexed Class nodes)
await servers.ouroboros.query_graph({
  query: "MATCH (a)-[r:CALLS]->(b:Class) RETURN count(b)"
});
//   Expect: non-zero count.
```

Test commands:

```bash
# Per-phase
npx vitest run src/main/codebaseGraph/indexingPipelinePasses.test.ts                # Phase B
npx vitest run src/main/codebaseGraph/indexingPipelineSupport.test.ts               # Phase C
npx vitest run src/main/codebaseGraph/treeSitterParser.test.ts                      # Phase D
npx vitest run src/main/codebaseGraph/                                              # all subdirectory tests at wrap

# Wave wrap (Phase F):
npm run lint
npx tsc --noEmit
```

## Files the next agent should read first

1. `src/main/codebaseGraph/indexingPipeline.ts` — pipeline orchestrator. `runIndex` (line ~219), `resolveFilesToProcess` (line ~329), `pruneDeletedFiles` (line ~319). Likely contains the bug.
2. `src/main/codebaseGraph/indexingPipelinePasses.ts` — `parsePass` (line ~79), `processDefinitionChunk` (line ~193), `collectDefinitions` (line ~115). The data flow.
3. `src/main/codebaseGraph/indexingPipelineIncremental.ts` — `filterChangedFiles`, `classifyFile`. Mtime/hash logic that may have an off-by-one or skip bug.
4. `src/main/codebaseGraph/treeSitterParser.ts` — `parseFile`, `extractDefinitions`. (Confirmed working; reference only.)
5. `src/main/codebaseGraph/indexingWorkerClient.ts` and `indexingWorker.ts` — the worker-thread entry. May explain main-thread-vs-worker discrepancies.
6. `src/main/codebaseGraph/graphDatabase.ts` — `insertNode`, `insertNodes`, `deleteNodesByFile`. Schema-level (confirmed using INSERT OR REPLACE; reference only.)
7. `roadmap/wave-66-graph-mcp-fixes.md` — preceding wave context.
8. `roadmap/auto-briefs/wave-66-result.md` — the smoke test where this surfaced.

## Note to the implementer

Do not assume the parser or grammar. The grammar parses every file in this repo correctly; testing already confirmed this. The bug is in the **glue between parsing and DB writes**. Look at:

- The order of operations in `resolveFilesToProcess` — could `deleteNodesByFile` fire AFTER `processDefinitionChunk` for some race-condition reason?
- Whether `filterChangedFiles` is incorrectly classifying these specific files as "unchanged" while their File node is somehow still updated.
- Whether the worker thread parses ≠ what vitest sees (different cwd, different load timing, different concurrent state).
- Whether there's an early-exit somewhere in `processDefinitionChunk` or its caller that I haven't traced.

The diagnostic phase will spelunk these. Resist the urge to "fix it cleanly" without first naming the proximate cause. The pipeline is load-bearing for every other graph feature; a wrong fix has wide blast radius.

## Orchestrator dispatch checklist

1. Move this plan to `roadmap/wave-67-indexer-coverage-repair.md` ← **already done**.
2. Dispatch Phase 0 → sonnet-implementer to write `roadmap/decisions/wave-67.md`.
3. Dispatch Phase A → **sonnet-diagnostician** to identify the orchestration bug. Output goes to `roadmap/wave-67-diagnostic.md`.
4. Orchestrator reviews diagnosis. If shaky, dispatch a second diagnostician.
5. Dispatch Phase B → sonnet-implementer with diagnosis as input.
6. Dispatch Phases C and D in parallel (after A completes — both depend on the diagnosis but not on each other).
7. Dispatch Phase E → sonnet-implementer to force-reindex and run audit queries.
8. Phase F: orchestrator runs Wave 66 + Wave 67 probes, signs smoke checklist, writes `roadmap/auto-briefs/wave-67-result.md`.
9. Final: `timeout 360 npx vitest run src/main/codebaseGraph/` + `npm run lint` + `npx tsc --noEmit`.
