# Wave 77-A Result Brief — Cypher Engine Feature Additions

**Branch:** `wave-77-cypher-wave-a`
**Commits:** 4 (cd01b52 → 0e76e14)
**Tests:** 120 passing, 0 failing

## What shipped

### A.1 — `supportedCypherFeatures` in `get_graph_schema`
`mcpToolHandlerDefs.ts`: Added `SUPPORTED_CYPHER_FEATURES` constant (14 entries) appended to `handleGetGraphSchema` output under "Supported Cypher features (query_graph):" key. Consumers (LLM, UI) can now discover supported syntax without trial-and-error.

### A.2 — Structured errors for unsupported clauses
`cypherEngineParser.ts`: `assertNoUnsupportedClauses()` fires at parse entry. Currently guards `WITH` (pipeline operator). Strips `STARTS WITH` / `ENDS WITH` before checking to avoid false positives on Cypher string operators. Error message names the unsupported feature and lists what IS supported.

### A.3 — OPTIONAL MATCH (LEFT JOIN)
`cypherEngineNewFeatures.ts`: `buildOptionalHopJoin()` translates `OPTIONAL MATCH (n)-[:TYPE]->(m)` to `LEFT JOIN edges e_opt ON ... LEFT JOIN nodes m ON ...`. Unmatched right-side rows project null rather than being dropped. Supported after any single-node or single-hop primary MATCH.

### A.4 — UNWIND (VALUES CTE)
`cypherEngineNewFeatures.ts`: `buildUnwindSql()` translates `UNWIND ['v1','v2'] AS x` to a `WITH _unwind(val) AS (VALUES (?),(?),...)` CTE joined to the nodes table. Maintains the read-only SQL invariant — no DDL or DML. Supports string and numeric literal lists.

### A.5 — Multi-pattern MATCH
`cypherEngineNewFeatures.ts`: `parseMultiPattern()` splits comma-separated hop patterns. `buildMultiPatternSql()` generates chained `INNER JOIN` SQL. Param ordering is explicit: JOIN ON params come before WHERE params to match SQL left-to-right binding. `MatchPattern` gains `multipat` variant; `ParsedQuery.match` dispatches to it.

### A.6 — ISO→epoch coercion for `indexed_at`
`cypherEngineSqlHelpers.ts`: `pushWhereParam()` detects `property === 'indexed_at' | 'indexedAt'` with an ISO date value (`/^\d{4}-\d{2}-\d{2}/`) and calls `Date.parse()` before binding. Applies to scalar and IN-list values. Fixes silent mismatches against the INTEGER ms column in the projects table.

## Files changed

| File | Change |
|---|---|
| `src/main/codebaseGraph/mcpToolHandlerDefs.ts` | A.1: SUPPORTED_CYPHER_FEATURES + schema output |
| `src/main/codebaseGraph/cypherEngineParser.ts` | A.2: assertNoUnsupportedClauses, STARTS/ENDS WITH fix, clause extractors |
| `src/main/codebaseGraph/cypherEngineSupport.ts` | A.3+A.5: UnwindClause, HopPattern, multipat MatchPattern variant, ParsedQuery extensions |
| `src/main/codebaseGraph/cypherEngineNewFeatures.ts` | NEW: buildOptionalHopJoin, buildUnwindSql, parseMultiPattern, buildMultiPatternSql |
| `src/main/codebaseGraph/cypherEngine.ts` | Full rewire: parse() + toSql() dispatch for all new features |
| `src/main/codebaseGraph/cypherEngineSqlHelpers.ts` | A.6: coerceIndexedAt in pushWhereParam |
| `src/main/codebaseGraph/cypherEngine.test.ts` | NEW: 8 entry-point integration tests |
| `src/main/codebaseGraph/cypherEngineNewFeatures.test.ts` | NEW: 27 tests (buildOptionalHopJoin unit + UNWIND/OPTIONAL MATCH/multi-pattern integration) |
| `src/main/codebaseGraph/cypherEngineSqlHelpers.test.ts` | 5 new A.6 coercion tests |
| `roadmap/wave-77-cypher-wave-a/wave-77-decisions.md` | ADR: VALUES CTE choice + parser-side coercion rationale |

## Regression status

All pre-existing suites green:
- `cypherEngine.smoke.test.ts` — 30 tests
- `cypherEngineRegression.test.ts` — 6 tests  
- `cypherEngine.propsAndIn.test.ts` — 17 tests (including STARTS WITH fix verified)

**One regression caught and fixed:** `assertNoUnsupportedClauses` was falsely triggering on `WHERE n.signature STARTS WITH 'x'` because `STARTS WITH` contains the word `WITH`. Fixed by stripping `STARTS|ENDS WITH` before the WITH-clause regex check.

## Out of scope (Wave B / Wave C)

- `WITH` clause support (pipeline operator) — Wave B
- OSS extraction spike — Wave C
