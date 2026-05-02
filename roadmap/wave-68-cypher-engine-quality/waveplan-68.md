# Wave 68 — Cypher Engine Quality Repair

## Status

DRAFT · target v2.10.x · follows Wave 67 (indexer coverage repair).

## Context — why this wave exists

Wave 67 restored the indexer and confirmed the underlying graph data is correct (3,307 files, 21,863 nodes, 48,367 edges, 18,277 DEFINES edges). But the Cypher engine that lets agents (and humans) introspect the graph is materially broken in ways that prevent basic verification queries from working.

Concrete bugs surfaced during Wave 67 smoke:

1. **Target-node label filter ignored.** `MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)` returns the total Function node count (13,273), not the count of CALLS edges into Class nodes. The engine appears to apply the source label correctly but ignores the target label.
2. **Anonymous-endpoint syntax rejected.** `MATCH ()-[r:DEFINES]->() RETURN count(r)` throws "Unsupported MATCH pattern" — fully anonymous endpoints aren't accepted even though they're valid Cypher.
3. **Relationship-property access broken.** `MATCH (a)-[r:CALLS]->(b) RETURN r.confidence` throws "no such column: r.props". The engine is translating `r.<prop>` into a SQL `r.props` reference that doesn't exist as a column.
4. **`labels(n)` silently dropped.** Calling `RETURN labels(n)` produces a column with empty values for every row, instead of either erroring or returning the node's label. Future queries that try to enumerate labels can't, and the silent failure mode hides the limitation.
5. **Project node properties have name mismatches.** `MATCH (p:Project) RETURN p.indexed_at` throws "no such column: p.indexed_at" even though `index_status` reads it correctly via its own code path. The engine is mapping `p.<prop>` to a column name that doesn't match the schema (likely camelCase vs snake_case drift).

These don't affect the MCP tools agents use day-to-day (`search_graph`, `trace_call_path`, `get_code_snippet`, `index_status` all work correctly). But they do prevent:
- Verification of Wave 67's Class-CALLS edges from outside the indexer
- Any nuanced ad-hoc query the orchestrator or smoke gate wants to run
- Future MCP tools that build on top of `query_graph`

## Goal

Every advertised Cypher pattern works correctly: target-node label filters apply, anonymous endpoints parse, `r.<prop>` resolves to the edge's `props` JSON value, `labels(n)` returns the node label, and project node property names map correctly. Failures produce clear errors instead of silent wrong results.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/decisions/wave-68.md`. Six decisions:

1. **Diagnose first, fix second.** Phase A is read-only investigation by `sonnet-diagnostician`. Output: `roadmap/wave-68-diagnostic.md` naming each bug with file:line evidence + the SQL the engine generates vs the SQL it should generate. Phase B doesn't start until each bug's proximate cause is named.
2. **No Cypher parser rewrite.** The engine's parser handles a useful subset; we fix the buggy translation paths, not the grammar. If a bug requires deeper parser surgery, scope it as a follow-up wave.
3. **Property access uses JSON1.** Edge property access `r.confidence` translates to `json_extract(edges.props, '$.confidence')` — same pattern existing helpers already use. Don't add a redundant `confidence` column on edges; that's already done in Wave 66 for the call-resolution case but most properties stay in JSON.
4. **Silent failures become loud failures.** When the engine encounters an unsupported function (`labels()`, `count()`, etc.), it errors with "unsupported function: <name>" rather than silently returning empty. Agents can adapt; silent wrong results train them to distrust the tool.
5. **Regression-test fixture covers each bug.** A `cypherEngine.smoke.test.ts` (or similar) runs each documented Cypher pattern against an in-memory DB with seeded nodes/edges. Failures regress the fix immediately.
6. **No `query_graph` schema change.** The MCP tool's input/output stays exactly as it is. Bug fixes are internal to `cypherEngine.ts` / `cypherEngineSqlHelpers.ts` / parser companions.

## Scope

**In scope:**
- Diagnose 5 numbered bugs to file:line + SQL-shape evidence
- Fix target-node label filter pushdown
- Fix anonymous-endpoint pattern parsing
- Fix relationship-property access to use `json_extract` on `edges.props`
- Implement `labels(n)` to return the node's `label` column value (graph stores one label per node, not multiple — implement as a single-string return)
- Fix project node property name mapping (snake_case columns vs camelCase exposed in Cypher)
- Add per-bug regression test in a new test fixture
- Replace silent failures with clear errors
- Update `query_graph` tool description to document supported Cypher subset

**Out of scope:**
- Multi-label nodes (the schema has one label per node)
- Cypher features the engine never implemented (`OPTIONAL MATCH`, `WITH`, `UNWIND`, `OR` operator, subqueries, custom aggregations beyond `count`)
- Schema changes to nodes/edges tables
- New MCP tools

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | ADR | sonnet-implementer | Capture decisions 1–6 in `roadmap/decisions/wave-68.md`. |
| A | Diagnose 5 bugs | **sonnet-diagnostician** | Read-only. Output: `roadmap/wave-68-diagnostic.md` with file:line, observed SQL, expected SQL, recommended fix shape per bug. Bugs are independent — diagnose all five before B starts. |
| B | Implement fixes | sonnet-implementer | Apply fixes per Phase A's diagnosis. Each bug gets its own minimal change + regression test. Files: `cypherEngine.ts`, `cypherEngineSqlHelpers.ts`, `cypherEngineSupport.ts`, `cypherEngineParser.ts`. |
| C | Tool description + docs | haiku-implementer | Update `query_graph` tool description in `mcpToolHandlers.ts` to enumerate supported Cypher syntax (single/multi-label patterns, anonymous endpoints, `r.<prop>` access, supported functions). |
| D | Regression fixture | haiku-test-author | New `cypherEngine.smoke.test.ts` runs each fixed Cypher pattern against an in-memory DB with a small seeded graph. One test per bug; assertions match the expected (post-fix) results. |
| E | Re-verify Wave 67 outstanding probes | orchestrator | After fixes land, re-run the failed Wave 67 probes (Class CALLS count, `r.confidence` access, anonymous-endpoint `MATCH ()-[r:DEFINES]->()`). Confirm they now return correct values. |
| F | Manual smoke + result brief | orchestrator | Sign `roadmap/auto-briefs/wave-68-result.md`. |

### Phase ordering

`0 → A → B → {C ∥ D} → E → F`. C and D can run in parallel after B because they're independent (description text vs test fixture). E runs only after all B/C/D land.

## Risks

| Risk | Mitigation |
|---|---|
| One of the 5 bugs is actually two bugs in disguise | Phase A's diagnostic is the gate — diagnostician is empowered to split or merge bugs. Phase B follows the diagnosis. |
| Fix for `r.<prop>` access creates a performance regression on large graphs | `json_extract` on a TEXT column is slow for thousands of edges. Mitigation: only apply when the property is referenced; don't preemptively json_extract every edge. Phase A's SQL evidence will tell us if the engine over-fetches. |
| Anonymous-endpoint parsing requires reworking the parser substantially | Risk-bound it: if the parser fix exceeds 30 lines, Phase B implementer escalates back to orchestrator for a re-scope decision (split into Wave 69). |
| `labels(n)` semantics change breaks existing callers | Existing callers see empty values today, so any non-empty return is strict improvement. No backward-compat concern. |
| Silent → loud failure mode breaks agents that were "succeeding" on bad results | Better to fail loud now than ship more queries that depend on broken silence. Tool description (Phase C) documents the new error semantics. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | n/a | Manual queries | Diagnosis is the deliverable |
| B | Yes — per-bug regression in `cypherEngineSqlHelpers.test.ts` (or sibling) | Yes — full pipeline of `query_graph` with each fixed pattern | Tests must include the failing pattern |
| C | No (docs) | No | Manual review |
| D | Yes — fixture covers all 5 fixed bugs | Yes — runs against a real `:memory:` DB with seeded graph | Catches regression on next change |
| E | n/a | Re-runs Wave 67 probes 6 + a couple of `r.confidence`/`labels` checks | Validates fix on real data |
| F | n/a | Manual smoke checklist | Signs the result brief |

## Acceptance criteria

- [ ] ADR at `roadmap/decisions/wave-68.md` with 6 decisions.
- [ ] Diagnostic at `roadmap/wave-68-diagnostic.md` names file:line + SQL evidence for each of the 5 bugs.
- [ ] `MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)` returns the actual count of CALLS edges into Class nodes (not Function count).
- [ ] `MATCH ()-[r:DEFINES]->() RETURN count(r)` returns 18,000+ (matches `index_status` DEFINES count).
- [ ] `MATCH ()-[r:CALLS]->() RETURN r.confidence LIMIT 5` returns numeric confidence values (1.0 backfilled or weighted per Wave 66 Phase E).
- [ ] `MATCH (n) WHERE n.name = 'GraphDatabase' RETURN labels(n)` returns "Class" (not empty).
- [ ] `MATCH (p:Project) RETURN p.indexed_at` returns the indexed timestamp (not "no such column").
- [ ] Cypher engine throws "unsupported function: <name>" rather than silently dropping unknown functions.
- [ ] Regression test fixture covers all 5 bugs; runs in <1s.
- [ ] `query_graph` tool description enumerates supported syntax.
- [ ] Manual smoke entry signed in `roadmap/auto-briefs/wave-68-result.md`.

## Verification

Post-fix probes via codemode proxy:

```ts
// 1. Target label filter
await servers.ouroboros.query_graph({ query: "MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)" });
// Expect: small/moderate non-zero (NOT total Function count or total node count)

// 2. Anonymous endpoint
await servers.ouroboros.query_graph({ query: "MATCH ()-[r:DEFINES]->() RETURN count(r)" });
// Expect: 18,000+ matching index_status

// 3. Relationship property access
await servers.ouroboros.query_graph({ query: "MATCH ()-[r:CALLS]->() RETURN r.confidence LIMIT 5" });
// Expect: numeric values

// 4. labels()
await servers.ouroboros.query_graph({
  query: "MATCH (n) WHERE n.name = 'GraphDatabase' RETURN labels(n) LIMIT 1"
});
// Expect: 'Class'

// 5. Project property name
await servers.ouroboros.query_graph({ query: "MATCH (p:Project) RETURN p.indexed_at" });
// Expect: epoch timestamp
```

Test commands:

```bash
npx vitest run src/main/codebaseGraph/cypherEngine.test.ts                    # Phase B+D
npx vitest run src/main/codebaseGraph/cypherEngineSqlHelpers.test.ts          # Phase B
npx vitest run src/main/codebaseGraph/cypherEngine.smoke.test.ts              # Phase D
npm run lint
npx tsc --noEmit
```

## Files the next agent should read first

1. `src/main/codebaseGraph/cypherEngine.ts` — main engine, query → SQL translator
2. `src/main/codebaseGraph/cypherEngineParser.ts` — clause/WHERE/ORDER BY parsers; likely site of anonymous-endpoint rejection
3. `src/main/codebaseGraph/cypherEngineSupport.ts` — SQL builders for single/hop/varpath patterns; likely site of target-label filter drop
4. `src/main/codebaseGraph/cypherEngineSqlHelpers.ts` — column resolution, WHERE-to-SQL; likely site of `r.props` translation bug + property name mapping
5. `src/main/codebaseGraph/cypherEngineVarpath.ts` — variable-path traversal (less affected; reference)
6. `src/main/codebaseGraph/graphDatabaseSchema.ts` — schema; columns nodes/edges actually have
7. `src/main/codebaseGraph/cypherEngine.test.ts` — existing tests for context
8. `roadmap/wave-67-result.md` — outstanding probes that should pass post-Wave-68

## Note to the implementer

Each of the 5 bugs is independent. Diagnose them as separate items, then fix as separate commits or chunks. The temptation is to refactor `cypherEngine.ts` into something cleaner — resist it. The engine's structure works for the supported subset; we're patching the broken paths, not redesigning.

If a bug looks deeper than its surface description (e.g., `labels(n)` requires changes across parser + planner + executor), STOP and write a re-scope note. We split into a follow-up wave rather than scope-creep this one.

## Orchestrator dispatch checklist

1. Move plan to `roadmap/wave-68-cypher-engine-quality.md` ← already done.
2. Dispatch Phase 0 → sonnet-implementer (ADR).
3. Dispatch Phase A → sonnet-diagnostician (5-bug diagnosis).
4. Review diagnosis; sanity-check each bug's evidence.
5. Dispatch Phase B → sonnet-implementer with diagnosis as input.
6. Dispatch Phase C → haiku-implementer (docs) and Phase D → haiku-test-author in parallel.
7. Phase E: orchestrator re-runs Wave 67 outstanding probes.
8. Phase F: result brief, smoke sign.
9. Final: targeted vitest + `npm run lint` + `npx tsc --noEmit`.
