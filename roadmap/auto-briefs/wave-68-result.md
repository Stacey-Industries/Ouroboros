# Wave 68 — Result Brief: cypherEngine Quality Repair

**Status:** READY FOR SMOKE · target v2.10.x
**Plan:** `roadmap/wave-68-cypher-engine-quality.md`
**ADR:** `roadmap/decisions/wave-68.md`
**Diagnostic:** `roadmap/wave-68-diagnostic.md`

---

## What shipped

Wave 67 surfaced 5 distinct cypherEngine bugs that prevented basic verification queries from working. Wave 68 fixed them all.

| Bug | Symptom (pre-Wave-68) | Behavior (post-Wave-68) |
|---|---|---|
| 1 | `MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)` returned the total Function node count (target-label filter ignored) | Returns the actual count of CALLS edges into Class nodes |
| 2 | `MATCH ()-[r:DEFINES]->() RETURN count(r)` threw "Unsupported MATCH pattern" | Parses cleanly; returns the DEFINES edge count |
| 3 | `RETURN r.confidence` threw "no such column: r.props" (cypher edge alias `r` mapped to non-existent SQL table) | Maps `r` to SQL alias `e`; emits `e.confidence` for dedicated columns and `json_extract(e.props, '$.foo')` for JSON properties |
| 4 | `RETURN labels(n)` silently returned empty values for every row | Returns the node's label as a string (`"Class"`, `"Function"`, etc.); unrecognized functions throw `"unsupported function: <name>"` |
| 5 | `MATCH (p:Project) RETURN p.indexed_at` threw "no such column" — Project columns live on the projects table, not nodes | Routes to `projects` table; `indexed_at`, `node_count`, `edge_count` resolve as direct columns |

A sixth issue surfaced during Phase D smoke testing: the HOP regex only handled `[r:TYPE]` and `[r]` but not `[:TYPE]` (anonymous-name + typed). Fixed in the same wave; full coverage of all four bracket forms now: `[]`, `[r]`, `[:TYPE]`, `[r:TYPE]`.

## Phase summary

- **Phase 0 — ADR.** `roadmap/decisions/wave-68.md` — six locked decisions: diagnose-first, no parser rewrite, JSON1 for non-column properties, silent → loud failures, regression fixture per bug, no `query_graph` schema change.
- **Phase A — Diagnose.** `sonnet-diagnostician` produced `roadmap/wave-68-diagnostic.md` (345 lines) with file:line + observed-vs-expected SQL evidence for each bug. Notable structural finding: bugs 1 and 2 share the same regex root cause; bug 3 has a primary AND secondary cause that needed both fixed.
- **Phase B — Implement fixes.** Two source files modified (`cypherEngine.ts`, `cypherEngineSupport.ts`) plus 6 regression tests in new `cypherEngineRegression.test.ts`. Phase B's first agent dispatch ended truncated mid-helper-extraction; orchestrator finished Bug 3's edge-alias mapping and Bug 5's Project routing, plus added the regression tests.
- **Phase C — Tool description.** `query_graph` description in `mcpToolHandlers.ts` now enumerates the supported Cypher subset: MATCH patterns, WHERE operators, RETURN forms (property access, COUNT, `labels()`, DISTINCT), ORDER BY, LIMIT (capped at 200), variable-length paths.
- **Phase D — Smoke fixture.** New `cypherEngine.smoke.test.ts` with 33 tests covering single-node, single-hop (outbound + inbound), anonymous endpoints (left, right, both), property access, WHERE filters, COUNT, `labels()`, ORDER BY + LIMIT, Project routing, edge-type filter, error cases. Surfaced a 6th regex gap (`[:TYPE]` syntax not parsing) which was fixed in the same wave.
- **Phase E — Re-verify Wave 67 probes.** All five outstanding Wave 67 probes that could only be verified via Cypher are now correct (per the regression tests).
- **Phase F — This brief.**

## Files touched

**New:**
- `src/main/codebaseGraph/cypherEngineRegression.test.ts` (Phase B; 6 tests, one per bug + unsupported-function clear-error)
- `src/main/codebaseGraph/cypherEngine.smoke.test.ts` (Phase D; 33 tests across 10 pattern categories)
- `roadmap/decisions/wave-68.md` (Phase 0)
- `roadmap/wave-68-cypher-engine-quality.md` (planning)
- `roadmap/wave-68-diagnostic.md` (Phase A)
- `roadmap/auto-briefs/wave-68-result.md` (this brief)

**Modified:**
- `src/main/codebaseGraph/cypherEngine.ts` — `singleNodeSql` routes Project label to `singleProjectSql` (new); `singleHopSql` passes Cypher edge alias to `buildSelectColumns`; `buildSelectColumns` now maps cypher edge alias → SQL alias 'e' and uses dedicated columns for edge properties (id/project/source_id/target_id/type/confidence) vs json_extract for JSON props
- `src/main/codebaseGraph/cypherEngineSupport.ts` — HOP_OUT / HOP_IN / SINGLE_NODE regex constants accept anonymous endpoints (\\w*), edge-bracket pattern handles all four forms ([], [r], [:TYPE], [r:TYPE]); MatchPattern hop variant gains `edgeAlias?: string`; hopFromMatch substitutes _n0/_n1 default aliases for anonymous endpoints; parseReturnField supports `labels(<alias>)` and throws on unsupported function calls
- `src/main/codebaseGraph/mcpToolHandlers.ts` — `query_graph` tool description enumerates supported Cypher subset

## Test results

- **Targeted (6 cypher tests)**: `npx vitest run src/main/codebaseGraph/cypherEngineRegression.test.ts src/main/codebaseGraph/cypherEngine.smoke.test.ts` → **39/39 pass**.
- **Full subdirectory**: `npx vitest run src/main/codebaseGraph/` → **602 pass, 3 skipped, 0 failed** across 37 test files.
- **Typecheck**: `npx tsc --noEmit -p tsconfig.node.json` clean.
- **Lint**: clean on touched files.

## Smoke probes (manual, post-IDE-restart)

**Required:** restart the Ouroboros app so the worker thread loads `out/main/indexingWorker.js` (no change needed in this wave) AND the renderer/main load the updated `out/main/chunks/cypherEngine-*.js`. Restart your Claude Code session so the codemode-proxy's MCP subprocess loads the new build.

**Probes (run in a fresh CC session):**

```ts
const out = {};

// 1. Target-label filter applied (Bug 1)
out.class_calls = await servers.ouroboros.query_graph({
  query: "MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)"
});
//   Expect: a moderate non-zero count (NOT total Function count, NOT total node count)

// 2. Anonymous-endpoint syntax (Bug 2)
out.defines_count = await servers.ouroboros.query_graph({
  query: "MATCH ()-[r:DEFINES]->() RETURN count(r)"
});
//   Expect: ~18,000+ matching index_status's DEFINES count

// 3. Relationship-property access (Bug 3)
out.confidence_sample = await servers.ouroboros.query_graph({
  query: "MATCH (a)-[r:CALLS]->(b) RETURN r.confidence LIMIT 5"
});
//   Expect: numeric values (1.0 default; will be varied once Wave 66 Phase E
//   call-resolution writes confidence values during indexing)

// 4. labels() function (Bug 4)
out.label_of_class = await servers.ouroboros.query_graph({
  query: "MATCH (n) WHERE n.name = 'GraphDatabase' RETURN labels(n) LIMIT 1"
});
//   Expect: 'Class'

// 5. Project node routing (Bug 5)
out.project = await servers.ouroboros.query_graph({
  query: "MATCH (p:Project) RETURN p.name, p.indexed_at"
});
//   Expect: { p_name: 'Agent IDE', p_indexed_at: <epoch ms> }

// 6. Unsupported function — clear error in response text (NOT a thrown exception)
//   The MCP handler wraps cypherEngine.execute in try/catch and returns
//   "Query error: ..." as the tool result string per Wave 66 Decision 1.
//   try/catch around the MCP call won't fire — the protocol returns a
//   successful tool response containing the error string.
const r = await servers.ouroboros.query_graph({ query: "MATCH (n) RETURN nonsense(n)" });
out.unsupported_function_response = JSON.stringify(r);
//   Expect: response text contains "Query error: unsupported function: nonsense"

return out;
```

## Acceptance gate (verified 2026-04-30)

- [x] User restarted Ouroboros app post-merge.
- [x] User restarted Claude Code session (so MCP subprocess loads new build).
- [x] Probe 1 — Class CALLS count = **58** (moderate non-zero; not total Function or total node count).
- [x] Probe 2 — DEFINES anonymous count = **18,282** (matches `index_status` DEFINES count).
- [x] Probe 3 — `r.confidence` returns **1.0, 1.0, ...** (default 1.0; will be varied once call-resolution writes confidence).
- [x] Probe 4 — `labels(n)` for `GraphDatabase` returns `**'Class'**`.
- [x] Probe 5 — `MATCH (p:Project)` returns `**'Agent IDE' | 1777610068099**`.
- [x] Probe 6 — Response text contains `**"Query error: unsupported function: nonsense"**` (the test contract is response-text, not thrown exception — MCP handlers return `Promise<string>` per Wave 66 Decision 1).
- [x] Smoke signed: orchestrator on 2026-04-30.

## Note on probe shape — `try/catch` does NOT fire on MCP errors

The codemode-proxy treats handler errors as successful tool responses with the error string in the response text. So:

```ts
// WRONG — try/catch never fires; out.error stays undefined
try {
  await servers.ouroboros.query_graph({ query: "...nonsense(n)..." });
} catch (e) { out.error = String(e); }

// RIGHT — inspect the response text
const r = await servers.ouroboros.query_graph({ query: "...nonsense(n)..." });
const errorText = (r[0] as { text?: string })?.text ?? '';
expect(errorText).toContain('unsupported function: nonsense');
```

This is by design — Wave 66 ADR Decision 1 keeps `Promise<string>` as the handler return type so error envelopes don't cascade through the MCP protocol. Future smoke probes should follow this shape.

## Deferred from this wave (intentional)

- **Cypher features the engine never supported**: `OPTIONAL MATCH`, `WITH`, `UNWIND`, `OR` in WHERE clauses, multi-pattern MATCH, custom aggregations beyond `count`. Scope is bigger than a quality wave; would need a parser rewrite per Decision 2.
- **Multi-label nodes.** The schema stores one label per node; `labels(n)` returns a string, not an array. Adding multi-label support would require schema changes.
- **`p.indexed_at` returned as Unix-ms in Cypher results.** No conversion to ISO string at query time; consumers can format it themselves. Adding a date-formatting function is out of scope.
- **Confidence value population.** Wave 66 Phase E added the `confidence` column with default 1.0; all existing edges have confidence=1.0. Differentiated confidence values (1.0 unique / 0.55 suffix-import / 0.30 fuzzy per the Codebase-Memory paper) require updates to call-resolution logic in `indexingPipelineCallResolution.ts` — separate wave.

## Notes for the next wave

- **The smoke fixture is the load-bearing regression guard.** It exercises the full surface of supported Cypher patterns. Future engine refactors must keep it green — it's the only test that catches whole-pattern-class regressions.
- **`labels(n)` returns single-string.** If multi-label support is added later, callers may need updating. Document the current contract in `query_graph` description.
- **The HOP regex's edge-bracket pattern is now the canonical reference.** All four bracket forms (`[]`, `[r]`, `[:TYPE]`, `[r:TYPE]`) parse correctly. Future edge-syntax extensions (e.g., `[r:TYPE {weight: 1.0}]`) need to extend this pattern explicitly.
