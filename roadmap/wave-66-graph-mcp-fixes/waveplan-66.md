# Wave 66 — Codebase Graph MCP Tool Surface Repair

## Status

DRAFT · target v2.10.x · follows Wave 65a (workbench utility drawer). Telemetry: ~0% adoption across 369 sessions despite a healthy 18,331-node / 13,161-edge graph.

## Context — why this wave exists

The codebase knowledge graph is healthy: SQLite-backed System 2, tree-sitter parsing, 18,331 nodes / 13,161 edges, auto-syncing on file changes. The graph data is correct. The MCP tool surface that exposes it to Claude Code agents is not.

Concrete failures confirmed at runtime:

- **`search_graph({query: "..."})`** silently returns all 18,331 nodes. Schema declares `name_pattern`; agents pass `query` per the natural verb (and per every doc/example). Handler reads `args.name_pattern` → undefined → DB does no-filter scan. Looks like a successful "broad" search; no search happened.
- **`trace_call_path({symbol: "..."})`** crashes with uncaught `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`. Schema requires `function_name`; the global rule example uses `symbol`.
- **`get_code_snippet({symbol: "..."})`** returns "Symbol not found: undefined". Schema requires `qualified_name`; agents reach for `symbol`.
- **`index_status({})`** returns "Project undefined is not indexed" on a healthy graph because no `project` was passed and there's no default-to-current-project logic.
- **`trace_call_path` direction** schema is `inbound|outbound|both`; the global rule shows `direction: 'callers'`, which silently falls back to `both`.

Root cause: parameter-name drift between schemas, handlers, tool descriptions, and the global routing rule that gets injected into every Claude Code session. Reinforced by stale CLAUDE.md content (says "~1.4K nodes" — actual is 18,331).

Fix shape: align names, validate loudly, plug coverage gaps, correct the docs. The single highest-leverage phase is A (parameter aliasing) — if A ships and nothing else does, adoption goes from 0% to something measurable. Everything after A hardens against the next class of silent failure.

## Goal

Every documented MCP graph tool succeeds when called with the natural parameter names shown in `~/.claude/rules/graph-tool-routing.md`. Failures return `"Error: <actionable message>"`, never silently scan the whole graph and never throw uncaught errors. Tree-sitter coverage matches advertised behavior for arrow-const functions, Python/Rust methods, and constructor calls. Docs match the actual graph size.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/decisions/wave-66.md`. Six decisions:

1. **Keep `Promise<string>` handler return type.** Do not migrate to MCP's `{ isError, content }` envelope. Failures prefix with `"Error: "`. Reason: the `McpToolDefinition` interface is consumed by the internal MCP server registrar and renderer-side mocks; upgrading is a multi-wave change for no Claude-Code-visible benefit.
2. **Bilingual aliasing, not hard rename.** Handlers read `args.query ?? args.name_pattern` — both names accepted; new (natural) name wins on collision. Schemas advertise the natural name as primary; old name remains as a deprecated alias for one wave, dropped in a future wave. Reason: zero risk of breaking any caller already using the schema-correct name; gives the routing rule + Claude Code's prompt cache a transition window.
3. **Add `confidence REAL DEFAULT 1.0` as a column on `edges`, not in `props` JSON.** Bumps `SCHEMA_VERSION` from 1 to 2. Reason: querying / sorting by confidence is a hot path; column wins on read speed and indexability over JSON-path extraction.
4. **Symbol-search tiering done in one query with a rank column** (UNION over exact / prefix / substring, ordered by rank), not separate handler calls. Reason: one DB round-trip; the handler can present "exact" / "prefix" / "fuzzy" sections from rank.
5. **Validation helper inline, not Zod.** Add `assertString(args, name)` / `assertOneOf(args, name, allowed)` next to handlers. Reason: avoid a runtime dep in main; ~10 handlers means a 30-line helper file beats wiring Zod.
6. **Bilingual direction enum on `trace_call_path`.** Accepts `inbound|outbound|both` AND `callers|callees`. Map `callers→inbound`, `callees→outbound`. Schema lists both sets in enum.

## Scope

**In scope:**
- Parameter aliasing for `search_graph`, `trace_call_path`, `get_code_snippet`, `index_status`.
- Validation helpers + `"Error: "` envelope across all 14 tool handlers.
- Tree-sitter coverage: non-exported arrow-const functions; Python/Rust class methods; `Class` inclusion in `buildSymbolsByName`.
- Schema migration v1 → v2: `confidence` column on edges; backfill default 1.0.
- 3-tier symbol search in `compatSearchGraph` (exact → prefix → substring with rank).
- Staleness check in `getCodeSnippet` against existing `content_hash`.
- Replace `as undefined` casts at `mcpToolHandlerHelpers.ts:46,49,50` with proper types.
- `manage_adr` schema gains `id` / `adr_id`; `ingest_traces` description calls out JSON-string requirement.
- GC ↔ indexing-worker mutual exclusion via existing `concurrency.ts` mutex helper.
- `~/.claude/rules/graph-tool-routing.md` corrections (call examples, direction enum, node count).
- Project `CLAUDE.md` and `src/main/codebaseGraph/CLAUDE.md` node/edge count corrections.

**Out of scope:**
- Migrating handlers to the `{ isError, content }` envelope.
- Introducing Zod runtime validation.
- Changing the `McpToolDefinition` interface.
- Reworking tree-sitter grammar configs beyond the three specific gaps.
- Rewriting `compatSearchGraph` substring core (only the tiering wrapper is added).
- New MCP tools.

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | ADR | sonnet-implementer | Capture decisions 1–6 in `roadmap/decisions/wave-66.md`. |
| A | Parameter aliasing (P0 silent-failure fixes) | **sonnet-implementer** | Bilingual reads in 4 handlers (`search_graph`, `trace_call_path`, `get_code_snippet`, `index_status`); schemas list both names with deprecation tag on legacy name; description text aligned with schema; direction-enum aliasing. **Highest-leverage phase.** |
| B | Doc & rule corrections | haiku-implementer | `~/.claude/rules/graph-tool-routing.md` examples; project `CLAUDE.md` and `src/main/codebaseGraph/CLAUDE.md` node/edge counts; tool-description text in `mcpToolHandlers.ts`. Must follow A so rule examples match handler-accepted names. |
| C | Validation + cleanup | haiku-implementer | Add `assertString` / `assertOneOf` / `assertJsonString` helpers in a new `mcpToolHandlerValidation.ts`; use at top of all 14 handlers; replace `as undefined` casts at lines 46/49/50 with typed reads; every error path returns `"Error: ..."`. |
| D | Tree-sitter coverage | sonnet-implementer | Extend `extractArrowFunctionExports` to also capture non-exported `lexical_declaration` arrow consts (rename to `extractArrowFunctions`). Add `function_definition` to Python `methodNodes`; equivalent for Rust. Include `Class` label in `buildSymbolsByName`; encode `new X()` → prefer Class, `X()` → prefer Function in `resolveCallEdges`. |
| E | Confidence + 3-tier search + staleness | sonnet-implementer | Schema v1→v2 migration: add `confidence REAL DEFAULT 1.0` to edges. Update call-resolution writes (1.0 unique, 0.55 suffix+import, 0.30 fuzzy). `compatSearchGraph` UNION-rank tiering. `getCodeSnippet` hash check vs current file with staleness warning. |
| F | Polish | haiku-implementer | `manage_adr` schema gains `id`/`adr_id`; `ingest_traces` description note. |
| G | GC ↔ worker mutex | haiku-implementer | Try-acquire pattern: GC checks worker not in flight; defers to next cycle if so. Reuse `concurrency.ts` Mutex. |
| H | Manual smoke + result brief | orchestrator | Probe each P0 tool with a natural call. Verify reindex picks up new arrow funcs on a fixture. Sign `roadmap/auto-briefs/wave-66-result.md`. |

### Phase ordering

`0 → A → B → C → D → E → F → G → H`

Validation (C) goes BEFORE tree-sitter coverage (D): smoke testing of new parser code gets clear `"Error: function_name required"` messages instead of `TypeError`s, and C sets the error-string convention E's staleness warning piggybacks on.

### Parallelization

After A+B land sequentially:
- **{C, D} can run in parallel** — disjoint file surface (validation touches handler tops; tree-sitter touches parser configs and call-resolution).
- **C must complete before E** — E's staleness warning uses C's error envelope.
- **D must complete before E's confidence writes** — E's call-resolution confidence values depend on D's `Class` extension.
- **{F, G} can run in parallel** after C — fully isolated subsystems.
- **H is sequential final.**

So: `0 → A → B`, then `{C ∥ D} → E`, with `{F ∥ G}` after C, finally `H`.

## Risks

| Risk | Mitigation |
|---|---|
| **Phase D triggers a 30–60s full reindex on next launch.** Adding `function_definition` to Python `methodNodes` and capturing non-exported arrow consts changes per-file extraction output ⇒ catalog hash mismatch ⇒ `IndexingWorkerClient` runs full reindex at startup. | Note in result brief and CLAUDE.md. User-visible latency on first launch after deploy is acceptable; graph repairs itself transparently. |
| **Phase E schema migration on a corrupt or older DB.** `SCHEMA_VERSION` 1→2 runs `ALTER TABLE edges ADD COLUMN confidence REAL DEFAULT 1.0`. If a user's DB is at version 0, the migration runner must walk 0→1→2. | Verify `graphDatabaseSchema.ts` chains migrations; add a unit test that constructs a v0 DB, opens it, asserts version is 2 and `confidence` column exists with default 1.0 backfilled. |
| **Bilingual aliasing makes the schema confusing.** Schemas advertise both `query` and `name_pattern`. Agents may pass both. | Handler precedence: new name wins (`args.query ?? args.name_pattern`). Document in tool description: "prefer `query`; `name_pattern` is a deprecated alias." Test passes both, asserts new wins. |
| **Phase D's `Class` inclusion doubles edges** if a class shares a name with a function. | Resolve in `resolveCallEdges` not `buildSymbolsByName`: `new X()` (NewExpression — already known to parser) prefers Class; plain `X()` prefers Function. |
| **Routing-rule edits in `~/.claude/rules/graph-tool-routing.md` change the loaded prompt for every Claude Code session globally.** | Strict ordering: A *then* B. Phase B never directs agents to a name handlers don't accept. |
| **GC mutex starves a long-running reindex.** | Try-acquire only: GC skips this cycle if worker is in flight. GC runs every startup + on a timer; missing one cycle is harmless. |
| **Phase E's UNION-rank search returns duplicates** when a symbol exact-matches AND prefix-matches AND substring-matches. | Group by `qualified_name`, keep MIN(rank). Test fixture: `searchGraph` (exact), `searchGraphInternal` (prefix), `compatSearchGraph` (substring) — assert all three appear in rank order, no duplicates. |
| **`getCodeSnippet` staleness hash check on every call adds latency.** | Acceptable: XXH3 sub-millisecond on typical files; staleness warning is essential since stale snippets after edits is a known failure. Document in the tool description. |
| **Phase A's `index_status` default-to-current-project changes behavior** for callers that wanted explicit project. | Previous behavior was always a bug ("Project undefined is not indexed"). No caller depended on it. Strictly an improvement. Test: no `project` arg → uses `ctx.projectName`; explicit `project` arg → uses that. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | Yes — handler accepts both names; new name wins on collision; direction-aliasing | **Yes** — real `GraphDatabase(':memory:')` + real handler; assert natural-call success on all 4 tools | Most important integration tests in the wave |
| B | No (docs) | No | Manual diff review |
| C | Yes — `assertString` throws on missing/wrong-type; `assertOneOf` rejects unknowns | No | Pure helper |
| D | Yes — fixture file with non-exported arrow consts → `Function` nodes appear; same for Python/Rust methods; `new Foo()` → CALLS edge into Class node | **Yes** — full pipeline run on a small fixture project | Coverage tests are the proof the bug is fixed |
| E | Yes — schema migration test (v0→v2, v1→v2); confidence backfilled; UNION-rank ordering; `getCodeSnippet` returns staleness on hash mismatch | **Yes** — end-to-end search returns ranked tiers; `getCodeSnippet` after a file edit returns staleness | Highest-risk test surface |
| F | Yes — `manage_adr` accepts `id` and `adr_id` (both); `ingest_traces` description text contains "JSON-encoded string" | No | Trivial |
| G | Yes — mutex prevents concurrent GC + reindex; GC defers when worker in flight | No | `concurrency.ts` already has Mutex helper to reuse |
| H | n/a | Manual smoke checklist | Sign `roadmap/auto-briefs/wave-66-result.md` |

## Acceptance criteria

- [ ] ADR at `roadmap/decisions/wave-66.md` with all 6 decisions.
- [ ] `search_graph({query: "GraphDatabase"})` returns ≤100 ranked nodes, not 18,331.
- [ ] `trace_call_path({symbol: "indexRepository", direction: "callers"})` returns a depth-grouped trace, not a TypeError.
- [ ] `get_code_snippet({symbol: "GraphDatabase"})` resolves the symbol via `searchNodes` and returns a snippet, not "Symbol not found: undefined".
- [ ] `index_status({})` defaults to the current workspace and returns per-label / per-edge counts of the live graph.
- [ ] Calling any of the 4 P0 tools with a missing required param returns a string starting with `"Error: missing required parameter '<name>'"`.
- [ ] Re-indexing a TS fixture with `const fn = () => ...` non-exported arrow consts produces `Function` nodes.
- [ ] Re-indexing a Python fixture with class methods produces `Method` nodes.
- [ ] `new Foo()` calls produce a CALLS edge from the call site into the `Class` node `Foo`.
- [ ] DB schema version is 2 after upgrade; `edges.confidence` exists; existing edges backfilled to 1.0.
- [ ] `compatSearchGraph` ranks exact above prefix above substring; tied substring matches share rank.
- [ ] `getCodeSnippet` after a file edit (without reindex) returns a snippet AND a staleness header.
- [ ] `~/.claude/rules/graph-tool-routing.md` examples match the post-A schema; both `inbound/outbound` and `callers/callees` documented.
- [ ] Project `CLAUDE.md` and `src/main/codebaseGraph/CLAUDE.md` reflect ~18.3K nodes / ~13.2K edges (or "graph size varies; query `index_status`").
- [ ] GC and reindex never run concurrently; smoke "trigger GC during reindex" doesn't deadlock.
- [ ] `npm test` passes; new tests for handlers, helpers, schema migration, tree-sitter coverage.
- [ ] Manual smoke entry signed in `roadmap/auto-briefs/wave-66-result.md`.

## Verification

End-to-end runtime probe via the codemode proxy after each phase commits:

```ts
// Phase A acceptance — natural calls
await servers.ouroboros.search_graph({ query: "GraphDatabase", limit: 5 });
await servers.ouroboros.trace_call_path({ symbol: "indexRepository", direction: "callers" });
await servers.ouroboros.get_code_snippet({ symbol: "GraphDatabase" });
await servers.ouroboros.index_status({});

// Phase D acceptance — tree-sitter coverage
await servers.ouroboros.query_graph({ query: "MATCH (f:Function) WHERE f.name = 'helper' RETURN f.qualifiedName" });
await servers.ouroboros.query_graph({ query: "MATCH (n)-[:CALLS]->(c:Class) RETURN c.name LIMIT 5" });

// Phase E acceptance — schema migration + 3-tier search + staleness
await servers.ouroboros.query_graph({ query: "MATCH ()-[r]->() RETURN r.confidence LIMIT 5" });
await servers.ouroboros.search_graph({ query: "searchGraph" });
```

Test commands:

```bash
# Per-phase: only the touched test files
npx vitest run src/main/codebaseGraph/mcpToolHandlerHelpers.test.ts                   # Phase A
npx vitest run src/main/codebaseGraph/mcpToolHandlerValidation.test.ts                # Phase C
npx vitest run src/main/codebaseGraph/treeSitterParser.test.ts                        # Phase D
npx vitest run src/main/codebaseGraph/graphDatabaseSchema.test.ts                     # Phase E
npx vitest run src/main/codebaseGraph/graphControllerCompat.integration.test.ts       # Phase A, D, E

# Wave wrap (Phase H):
timeout 360 npx vitest run                                                            # full suite
npm run lint
npx tsc --noEmit
```

## Files the next agent should read first

1. `src/main/codebaseGraph/mcpToolHandlers.ts` — TOOL_SCHEMAS constant, all 14 tool definitions, descriptions
2. `src/main/codebaseGraph/mcpToolHandlerHelpers.ts` — `handleSearchGraph` (the `name_pattern` bug at line 47); `handleTraceCallPath`; the `as undefined` casts at lines 46/49/50
3. `src/main/codebaseGraph/mcpToolHandlerDefs.ts` — `handleGetCodeSnippet`, `handleIndexStatus`, `handleIngestTraces` (symbol auto-resolve, default project, JSON-string note)
4. `src/main/codebaseGraph/treeSitterLanguageConfigs.ts` — Python and Rust `methodNodes` arrays
5. `src/main/codebaseGraph/treeSitterParserDefs.ts` — `extractArrowFunctionExports` (extend to non-exported)
6. `src/main/codebaseGraph/indexingPipelineCallResolution.ts` — `buildSymbolsByName` (line 133-144, add Class) and `resolveCallEdges` (NewExpression preference)
7. `src/main/codebaseGraph/graphDatabaseSchema.ts` — `SCHEMA_VERSION`, `SCHEMA_SQL`, migration runner (Phase E v1→v2)
8. `src/main/codebaseGraph/queryEngine.ts` — `getCodeSnippet` (Phase E staleness check)
9. `src/main/codebaseGraph/graphControllerCompatQueries.ts` — `compatSearchGraph` (Phase E 3-tier UNION-rank)
10. `src/main/codebaseGraph/graphGc.ts` and `src/main/codebaseGraph/indexingWorkerClient.ts` — Phase G mutex
11. `src/main/codebaseGraph/concurrency.ts` — existing Mutex helper to reuse in Phase G
12. `~/.claude/rules/graph-tool-routing.md` — Phase B rule corrections
13. `roadmap/wave-64-chat-session-lifecycle.md` — format reference for this wave file

## Note to the implementer

This wave is unglamorous repair work for a working subsystem with a broken doorway. The graph itself is fine. Resist the urge to rebuild any of System 2's internals. Each phase is small and well-scoped; trust the audit, do not re-audit.

The single highest-leverage change is Phase A — if A ships and nothing else does, adoption goes from 0% to something measurable. Everything after A is hardening.

Don't introduce Zod. Don't migrate to the `{ isError, content }` envelope. Don't bypass `GraphControllerCompat`. Don't touch any handler outside `mcpToolHandlerHelpers.ts` / `mcpToolHandlerDefs.ts` / `mcpToolHandlers.ts`. The 4 P0 fixes plus tree-sitter coverage cover the failure modes telemetry actually sees.

## Orchestrator dispatch checklist

After plan approval and exit from plan mode, the orchestrator (this session) will:

1. ✅ Move plan file to `roadmap/wave-66-graph-mcp-fixes.md`.
2. Dispatch Phase 0 → sonnet-implementer to write `roadmap/decisions/wave-66.md`.
3. Dispatch Phase A → sonnet-implementer (parameter aliasing).
4. Review Phase A diff; run probe test; commit.
5. Dispatch Phase B → haiku-implementer (docs/rules) once A is committed.
6. Dispatch Phase C → haiku-implementer in parallel with Phase D → sonnet-implementer.
7. Review C and D; commit.
8. Dispatch Phase E → sonnet-implementer (schema migration + 3-tier search + staleness).
9. Dispatch Phase F → haiku-implementer in parallel with Phase G → haiku-implementer (after C is in).
10. Phase H: orchestrator runs runtime probes, signs smoke checklist, writes `roadmap/auto-briefs/wave-66-result.md`.
11. Final: `timeout 360 npx vitest run` + `npm run lint` + `npx tsc --noEmit` from parent context (per test-scope rule, full suite at wave wrap).
