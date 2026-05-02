# Wave 66 — Result Brief: Codebase Graph MCP Tool Surface Repair

**Status:** READY FOR SMOKE · target v2.10.x
**Plan:** `roadmap/wave-66-graph-mcp-fixes.md`
**ADR:** `roadmap/decisions/wave-66.md`

---

## What shipped

The codebase knowledge graph MCP tool surface is now usable. The graph itself was always healthy (~18.3K nodes, ~13.2K edges); the doorway was broken — silent full-table scans on natural calls, uncaught `TypeError`s on the global routing rule's example, stale documentation off by 13×. Wave 66 fixed the doorway, plugged three tree-sitter coverage gaps, and added a confidence column for future ranking work.

| Failure mode (pre-wave) | After |
|---|---|
| `search_graph({query: "X"})` returned all 18,331 nodes silently | Returns ranked nodes (exact / prefix / substring tiers), filtered correctly |
| `trace_call_path({symbol: "X", direction: "callers"})` crashed with `TypeError` | Returns a depth-grouped trace; both vocabularies (`symbol`/`function_name`, `callers`/`inbound`) accepted |
| `get_code_snippet({symbol: "X"})` returned "Symbol not found: undefined" | Auto-resolves bare names via case-sensitive search; ambiguous returns a clear error |
| `index_status({})` reported "Project undefined is not indexed" | Defaults to current workspace; reports live counts |
| Non-exported `const fn = () => …` invisible to graph | Indexed as `Function` nodes (top-level only; nested closures still skipped) |
| Python/Rust class methods labeled as `Function` | Methods inside `class_definition` / `impl_item` correctly labeled `Method` with receiver |
| `new Foo()` calls didn't resolve to `Class` nodes | Constructor calls now resolve via `isNewExpression` preference in resolver |
| No staleness check on snippet output | XXH3 hash compare to indexed `content_hash`; warning prepended on mismatch |

## Phase summary

- **Phase 0 — ADR.** Six locked decisions in `roadmap/decisions/wave-66.md`: keep `Promise<string>` return, bilingual aliasing, `confidence` as a column not JSON, UNION-rank in one query, inline validators not Zod, bilingual direction enum.
- **Phase A — Parameter aliasing (P0).** `search_graph`, `trace_call_path`, `get_code_snippet`, `index_status` all accept both schema-correct AND natural names. Direction enum gains `callers`/`callees`. Auto-resolve for bare symbol names. 25 new tests.
- **Phase B — Doc + rule corrections.** `~/.claude/rules/graph-tool-routing.md` example calls and graph-size note updated. Project `CLAUDE.md` updated to reflect 18.3K/13.2K. `src/main/codebaseGraph/CLAUDE.md` had no count to update.
- **Phase C — Validation helpers + cleanup.** New `mcpToolHandlerValidation.ts` with `assertString` / `assertOneOf` / `assertJsonString` (all errors prefixed `"Error: "`). `manage_adr` and `ingest_traces` validate required params. Replaced `as undefined` casts with proper `NodeLabel` / `EdgeType` types. 15 new tests.
- **Phase D — Tree-sitter coverage.** `extractArrowFunctions` (renamed from `…Exports`) walks both export_statement AND top-level lexical_declaration in TS/JS. Python `function_definition` and Rust `function_item` added to their `methodNodes`; `extractSingleDefinition` demotes Method-labeled nodes to Function when no class/impl ancestor exists. `Class` label included in `buildSymbolsByName`; `resolveCallee` prefers Class candidates when `call.isNewExpression`. `ExtractedCall.isNewExpression` flag wired through the parser.
- **Phase E — Schema v1→v2 + 3-tier search + staleness.** `ALTER TABLE edges ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0`; new `graphDatabaseMigrations.ts` module owns versioned migrators. New `searchNodesRanked` (UNION ALL exact/prefix/substring with mutually exclusive WHERE clauses, ordered by rank, name). `handleSearchGraph` routes to ranked path when only `query` is supplied; falls back to filter-rich path otherwise. `formatSnippet` (mcpToolHandlerDefs) hashes the current file via XXH3 and prepends a stale-warning when it differs from `content_hash`.
- **Phase F — manage_adr + ingest_traces polish.** `manage_adr` schema gains `id` and `adr_id` properties (DB methods remain project-level only — per-ID targeting deferred). `ingest_traces` description and property doc both spell out the JSON-string requirement.
- **Phase G — GC ↔ worker mutex.** New `Mutex` class in `concurrency.ts` (try-acquire / acquire / release / runExclusive). `IndexingWorkerClient` acquires on first dispatch, releases when all pending requests settle. `pruneExpiredProjects` skips its cycle when `isIndexingInProgress()` returns true (optional-chained for test contexts where the worker is uninitialized).
- **Phase H — This brief + final gates.**

## Files touched

**New:**
- `src/main/codebaseGraph/mcpToolHandlerValidation.ts` + `.test.ts` (Phase C)
- `src/main/codebaseGraph/mcpToolHandlerSearch.ts` + `.test.ts` (Phase E)
- `src/main/codebaseGraph/graphDatabaseMigrations.ts` + `.test.ts` (Phase E)
- `roadmap/decisions/wave-66.md` (Phase 0)
- `roadmap/wave-66-graph-mcp-fixes.md` (planning)
- `roadmap/auto-briefs/wave-66-result.md` (this brief)

**Modified:**
- `CLAUDE.md` — graph size correction
- `src/main/codebaseGraph/mcpToolHandlers.ts` — schemas (`search_graph`, `trace_call_path`, `get_code_snippet`, `index_status`, `manage_adr`, `ingest_traces`), tool descriptions
- `src/main/codebaseGraph/mcpToolHandlerHelpers.ts` — `handleSearchGraph` (delegates to search helpers), `handleTraceCallPath` (resolveDirection, formatTraceResult, missing-param guard), `handleManageAdr` (id alias)
- `src/main/codebaseGraph/mcpToolHandlerDefs.ts` — `handleGetCodeSnippet` (resolveQualifiedName, formatSnippet with staleness), `handleIndexStatus` (default to ctx.projectName), `handleIngestTraces` (validation + EdgeType cast)
- `src/main/codebaseGraph/treeSitterParser.ts` — `extractArrowFunctions` (combined exported + non-exported walker), `isNewExpression` populated on extracted calls
- `src/main/codebaseGraph/treeSitterParserDefs.ts` — `resolveMethodContext` helper for label demotion; arrow declarator refactor to ctx object
- `src/main/codebaseGraph/treeSitterTypes.ts` — `ExtractedCall.isNewExpression`
- `src/main/codebaseGraph/treeSitterLanguageConfigs.ts` — Python and Rust `methodNodes` populated
- `src/main/codebaseGraph/indexingPipelineCallResolution.ts` — `Class` in `buildSymbolsByName`, `isNewExpression` plumbed through `resolveCallee`, `classIds` Set
- `src/main/codebaseGraph/graphDatabase.ts` — `searchNodesRanked` method
- `src/main/codebaseGraph/graphDatabase.test.ts` — version 2 expectations
- `src/main/codebaseGraph/graphDatabaseHelpers.ts` — `runSearchNodesRanked` UNION query
- `src/main/codebaseGraph/graphDatabaseSchema.ts` — `SCHEMA_VERSION` 1→2; `confidence REAL NOT NULL DEFAULT 1.0` on edges
- `src/main/codebaseGraph/graphDatabaseSchema.test.ts` — version 2
- `src/main/codebaseGraph/queryEngine.ts` — minor whitespace
- `src/main/codebaseGraph/concurrency.ts` — `Mutex` class
- `src/main/codebaseGraph/concurrency.test.ts` — Mutex tests
- `src/main/codebaseGraph/graphGc.ts` — try-acquire of indexing flag (optional-chained)
- `src/main/codebaseGraph/graphGc.test.ts` — mutex coordination tests
- `src/main/codebaseGraph/indexingWorkerClient.ts` — mutex acquire/release lifecycle, `isIndexingInProgress()`

## Test results

- **codebaseGraph subdirectory:** `npx vitest run src/main/codebaseGraph/` — **31 files, 544 passed, 3 skipped, 0 failed.** Includes 12 graph migrations, 3-tier search, validation helpers, GC mutex, and all pre-existing tests.
- **Typecheck:** `npx tsc --noEmit` — clean.
- **Lint (full repo):** `npm run lint` — 0 errors, 3 pre-existing warnings (`FileViewerChrome.tsx`, `HtmlPreview.tsx`, `delegationCoach/patterns.test.ts`) all in non-Wave-66 files.
- **Full test suite:** not run at wave wrap (per orchestrator instruction). Per-subdirectory pass + clean tsc + clean lint is the gate.

## Manual smoke

Wave 66 is main-process / graph-subsystem only — no renderer Layout changes, so the project's manual-smoke-gate rule (`~/.claude/rules/manual-smoke-gate.md`) does not trigger. Smoke verification is via runtime probes against the in-process MCP server.

**Required for smoke:** relaunch the IDE so the host process picks up the new code (the running instance has the pre-wave handlers and tree-sitter parser).

**On next launch, expect a one-time full reindex** (~30–60 s) because the tree-sitter parser output changed (non-exported arrow functions; Python/Rust method labels; `isNewExpression` on calls). The catalog hash will mismatch and `IndexingWorkerClient.runIndex` will rebuild the graph from scratch. Schema migration 1→2 runs at the same time, adding the `confidence` column with backfill.

**Post-relaunch smoke probes (paste into a Claude Code session):**

```ts
// 1. P0 silent-failure fix — search_graph natural call
await servers.ouroboros.search_graph({ query: "GraphDatabase", limit: 5 });
//   Expect: ≤5 ranked nodes, NOT 18,331. Headers like "Exact matches:" / "Prefix matches:".

// 2. P0 crash fix — trace_call_path with symbol+callers
await servers.ouroboros.trace_call_path({ symbol: "indexRepository", direction: "callers" });
//   Expect: depth-grouped trace, NOT a TypeError.

// 3. P0 fix — get_code_snippet auto-resolve
await servers.ouroboros.get_code_snippet({ symbol: "GraphDatabase" });
//   Expect: snippet body (not "Symbol not found: undefined").

// 4. P0 fix — index_status default
await servers.ouroboros.index_status({});
//   Expect: live counts for current project, NOT "Project undefined is not indexed".

// 5. Phase D — non-exported arrow functions indexed
await servers.ouroboros.query_graph({
  query: "MATCH (f:Function) WHERE f.name = 'truncate' RETURN f.qualifiedName, f.filePath, f.startLine LIMIT 3"
});
//   Expect: at least one match, e.g. mcpToolHandlerHelpers (truncate is a non-exported helper there).

// 6. Phase D — Class constructor resolution
await servers.ouroboros.query_graph({
  query: "MATCH (caller)-[:CALLS]->(c:Class) RETURN c.name, caller.name LIMIT 5"
});
//   Expect: at least a few new constructor edges into Class nodes.

// 7. Phase E — confidence column populated
await servers.ouroboros.query_graph({
  query: "MATCH ()-[r:CALLS]->() RETURN r.confidence LIMIT 5"
});
//   Expect: numeric values (1.0 backfilled for existing edges).
```

If any of #1–#4 still fails, the host hasn't relaunched.

## Deferred from this wave (intentional)

- **`manage_adr` per-ID targeting.** Schema accepts `id` / `adr_id`, but the underlying DB methods (`getAdr`, `upsertAdr`) are project-scoped only. Adding per-ID storage is a separate wave; the schema change is forward-compatible.
- **Confidence values on call-resolution writes.** Phase E added the column (default 1.0); call-resolution still writes without explicit confidence. The column is populated correctly by default. Nuanced confidence scoring (1.0 unique / 0.55 suffix-import / 0.30 fuzzy per the Codebase-Memory paper) is the next iteration.
- **Drop legacy parameter aliases.** Bilingual aliasing kept the old names (`name_pattern`, `function_name`, `qualified_name`, `inbound`/`outbound`) accepted for one wave. A future wave drops them per ADR Decision 2.
- **`McpToolDefinition` `{ isError, content }` envelope migration.** Held at `Promise<string>` per ADR Decision 1. Strings remain the contract until a separate envelope-migration wave.

## Wave gate (manual)

- [ ] User relaunched IDE post-merge.
- [ ] Probes #1–#4 returned the expected results.
- [ ] Probes #5–#7 returned the expected results post-reindex.
- [ ] No console errors in the main process during reindex.
- [ ] Smoke signed: ____ on ____.

## Notes for the next wave

- **Adoption telemetry.** The pre-wave reading was 0% across 369 sessions (`memory/project_graph_tool_adoption_gap.md`). Re-measure after a couple of weeks of post-Wave-66 sessions to confirm the doorway fix moved the needle.
- **Drop deprecated aliases.** A short follow-up wave (~Wave 67 or 68) can remove the `name_pattern` / `function_name` / `qualified_name` / `inbound|outbound`-only aliases. ADR-tagged as one-wave deprecation.
- **Confidence-aware ranking.** Now that the column exists, the next iteration is to write actual confidence values during call resolution (Codebase-Memory pattern: 1.0 unique, 0.55 suffix+import, 0.30 fuzzy) and surface them in tool output where useful.
