# Wave 80 Mechanical Review

## Acceptance criteria check

| Criterion | Status | Notes |
|---|---|---|
| `GraphEdge.confidence?: number` optional field | PASS | `graphDatabaseTypes.ts` |
| `insertEdge` persists confidence (default 1.0) | PASS | `graphDatabaseHelpers.ts` + `graphDatabase.ts` |
| `callResolutionPass` emits 4 distinct confidence levels | PASS | `indexingPipelineCallResolution.ts` |
| Import-resolved → ~0.95 | PASS | Constant `CONFIDENCE_IMPORT_RESOLVED = 0.95` |
| Same-file → ~0.85 | PASS | Constant `CONFIDENCE_SAME_FILE = 0.85` |
| Name-unique → ~0.80 | PASS | Constant `CONFIDENCE_NAME_UNIQUE = 0.80` |
| New-expression class → ~0.65 | PASS | Constant `CONFIDENCE_NEW_EXPRESSION_CLASS = 0.65` |
| 5 resolution-path tests in `indexingPipelineCallResolution.test.ts` | PASS | 5/5 pass |
| `BfsOptions.minConfidence` SQL-level filter | PASS | `graphDatabaseTraversal.ts` |
| `TraceCallPathOptions.minConfidence` | PASS | `queryEngineTypes.ts` |
| `DetectChangesOptions.minConfidence` | PASS | `queryEngineTypes.ts` |
| `handleTraceCallPath` parses `min_confidence` | PASS | `mcpToolHandlerHelpers.ts` |
| `handleDetectChanges` parses `min_confidence` | PASS | `mcpToolHandlerHelpers.ts` |
| `min_confidence` default 0 (no filter) | PASS | `(args.min_confidence as number) ?? 0` |
| 3 min_confidence filter tests in `mcpToolHandlerHelpers.test.ts` | PASS | 3/3 pass |
| `get_graph_schema` "Edge fields:" section | PASS | `mcpToolHandlerDefs.ts` |
| `min_confidence` in tool schemas | PASS | `mcpToolHandlers.ts` |
| `phase-a-calibration.md` present | PASS | `roadmap/wave-80-edge-confidence/` |
| `wave-80-decisions.md` present | PASS | `roadmap/wave-80-edge-confidence/` |
| `wave-80-result.md` present | PASS | `roadmap/wave-80-edge-confidence/` |

## Scope hygiene

- httpLinkPass: not touched
- Non-CALLS edge types: confidence unchanged (all default 1.0)
- UI layer: not touched
- ESLint ceiling: not relaxed; all files pass tsc + eslint clean

## Out-of-scope items not touched

- `searchGraph` / `handleSearchGraph` — wave plan explicitly excluded (confidence filter on graph traversal, not search)
- ASYNC_CALLS edges — emitted by a separate pass, not `callResolutionPass`; covered by same DB/BFS changes

## Potential issue: ASYNC_CALLS edges

The `callResolutionPass` handles only `CALLS`. Async call edges are presumably inserted separately. Wave 80's BFS filter applies to both `CALLS` and `ASYNC_CALLS` but confidence emission only covers `CALLS`. This is a known gap; the plan notes non-CALLS edges are out of scope.

## All codebaseGraph tests

40 test files, 639 passed + 3 skipped. No new failures introduced.
