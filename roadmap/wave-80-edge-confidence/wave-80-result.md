# Wave 80 Result Brief — graph-edge-confidence-scoring

## What shipped

### Phase A — Calibration

Audited all 4 resolution paths in `callResolutionPass` and assigned calibrated confidence values:

| Resolution path | Confidence | Rationale |
|---|---|---|
| Import-resolved (exact import statement) | 0.95 | Near-certain; only alias ambiguity possible |
| Same-file definition | 0.85 | High but not import-verified |
| Name-unique global (one match across project) | 0.80 | Reasonable — no import, relies on uniqueness |
| New-expression class disambiguation | 0.65 | Best-guess among multiple same-name classes |

Full reasoning in `roadmap/wave-80-edge-confidence/phase-a-calibration.md`.

### Phase B — Confidence emission

- `GraphEdge.confidence` made optional (default 1.0); `insertEdge` persists it
- `callResolutionPass` emits calibrated confidence on every CALLS edge
- 5 tests in `indexingPipelineCallResolution.test.ts` — one per resolution path + one no-edge case
- All 19 tests pass (5 new + 14 pre-existing)

### Phase C — Reindex verification

Pre-reindex snapshot (DB indexed before Wave 80 code landed):
- Total edges: 45,693
- CALLS/ASYNC_CALLS edges: 14,763
- All at confidence 1.0 (pre-Wave-80 default)

After the app loads Wave 80 code and reindexes, the distribution will be non-uniform across the 4 buckets. The confidence column exists (`REAL NOT NULL DEFAULT 1.0`), schema migration confirmed via `PRAGMA table_info(edges)`.

### Phase D — minConfidence filter

- `BfsOptions.minConfidence?: number` → SQL-level filter in recursive CTE (not post-filter)
- `TraceCallPathOptions.minConfidence?: number` wired through `queryEngine.traceCallPath`
- `DetectChangesOptions.minConfidence?: number` wired through `queryEngine.detectChanges`
- `handleTraceCallPath` and `handleDetectChanges` parse `min_confidence` arg (default 0 = no filter)
- 3 new `min_confidence` tests in `mcpToolHandlerHelpers.test.ts` pass

### Phase E — Schema disclosure

`get_graph_schema` now includes an "Edge fields:" section documenting:
- `confidence`: float 0.0–1.0, CALLS/ASYNC_CALLS edges only
- Calibrated values per resolution path
- Guidance to use `min_confidence` on `trace_call_path` / `detect_changes` to filter

## Files changed

| File | Change |
|---|---|
| `src/main/codebaseGraph/graphDatabaseTypes.ts` | Added optional `confidence` to `GraphEdge` |
| `src/main/codebaseGraph/graphDatabaseHelpers.ts` | `insertEdge` SQL includes confidence; `rowToEdge` maps it |
| `src/main/codebaseGraph/graphDatabase.ts` | `insertEdge` passes `confidence ?? 1.0` |
| `src/main/codebaseGraph/indexingPipelineCallResolution.ts` | Confidence constants + `CalleeResolution` return type |
| `src/main/codebaseGraph/indexingPipelineCallResolution.test.ts` | 5 new confidence emission tests (created) |
| `src/main/codebaseGraph/graphDatabaseTraversal.ts` | `BfsOptions.minConfidence` + SQL WHERE clause |
| `src/main/codebaseGraph/queryEngineTypes.ts` | `minConfidence` on both options types |
| `src/main/codebaseGraph/queryEngineSupport.ts` | `collectTraceEdges` moved here; `ImpactedCallersOptions` object |
| `src/main/codebaseGraph/queryEngine.ts` | Wire `minConfidence` through BFS; import `collectTraceEdges` |
| `src/main/codebaseGraph/mcpToolHandlerHelpers.ts` | Parse `min_confidence` in both handlers |
| `src/main/codebaseGraph/mcpToolHandlerHelpers.test.ts` | 3 new min_confidence filter tests |
| `src/main/codebaseGraph/mcpToolHandlers.ts` | `min_confidence` param in tool schemas |
| `src/main/codebaseGraph/mcpToolHandlerDefs.ts` | "Edge fields:" section in `get_graph_schema` |

## Constraints honored

- ESLint ceiling never relaxed: max-lines, max-lines-per-function, max-params:4 all satisfied
- `confidence` defaults to 1.0 for all non-CALLS edge types — no behavioral change for existing callers
- `min_confidence` defaults to 0 — no behavioral change for existing callers
- httpLinkPass, ingestTraces, and other edge inserters untouched

## Manual smoke gate

Phase F smoke is a post-reindex check. With the app running the Wave 80 build:

```
trace_call_path({ symbol: "indexingPass", direction: "callees", min_confidence: 0.85 })
```

Expected: import-resolved and same-file callees appear; new-expression and name-unique-only callees (if any) are filtered. Spot-check a second call with `min_confidence: 0` to confirm the filtered-out edges exist.

- [ ] Launched app with Wave 80 code loaded
- [ ] `trace_call_path` with `min_confidence: 0` returns full callee set
- [ ] `trace_call_path` with `min_confidence: 0.85` filters out < 0.85 edges
- [ ] `get_graph_schema` "Edge fields:" section appears in output
- [ ] No console errors on first use
- [ ] Smoke signed: _pending post-reindex_
