# Wave 80 — Graph Edge Confidence Scoring

**Status:** IN-PROGRESS
**Source:** `roadmap/future/graph-edge-confidence-scoring.md`
**Wave number:** 80
**Slug:** edge-confidence
**Filed:** 2026-05-02
**Prerequisite:** Wave 67 (indexer coverage repair) — SHIPPED (commit `d2f8758`)

---

## Context

The graph stores `confidence REAL NOT NULL DEFAULT 1.0` on every edge (schema migration v2, `graphDatabaseSchema.ts:59`). Some passes already emit real confidence: `httpLinkPass.ts` scores 0.0–1.0 based on route/method match. But the most common edge type — `CALLS` and `ASYNC_CALLS` edges from tree-sitter parsing — **always lands as `confidence = 1.0`** regardless of how reliable the resolution actually was.

Call resolution in `indexingPipelineCallResolution.ts` has several distinct paths with different reliability: import-resolved, same-file definition, single global match, and name-collision fallback. These currently all write the same `confidence = 1.0`. Agents using `trace_call_path` can't distinguish "this is definitely the caller" from "we picked one of three functions with the same name."

Wave 67 fixed which calls get emitted (file coverage). This wave fixes how confidently they're scored.

## Goal

1. Calibrate confidence levels for each call-resolution path (Phase A — read-only audit).
2. Emit per-edge confidence in `callResolutionPass` (Phase B).
3. Verify the graph DB shows a non-uniform distribution after reindex (Phase C).
4. Add optional `minConfidence` filter to `searchGraph`, `traceCallPath`, and `detectChanges` (Phase D).
5. Advertise `confidence` field in `get_graph_schema` output and update tool descriptions (Phase E).
6. Manual smoke + result brief (Phase F).

## Locked decisions

See `roadmap/wave-80-edge-confidence/wave-80-decisions.md`.

## Scope

**In scope:**
- Confidence emission for `CALLS` and `ASYNC_CALLS` edges only
- Heuristic confidence levels per resolution path (calibrated in Phase A)
- Optional `minConfidence` filter on `searchGraph`, `traceCallPath`, `detectChanges`
- `get_graph_schema` advertising `confidence` + calibrated meaning
- One-time reindex to populate real confidence values

**Out of scope (per source plan):**
- Confidence on non-CALLS edge types (`HTTP_CALLS` already handled; others are separate audit items)
- Post-launch heuristic re-tuning (telemetry-driven; future wave)
- Renderer visualization of confidence
- Changing `httpLinkPass` confidence model

---

## Phases

| Phase | Topic | Files touched | Gate |
|---|---|---|---|
| A | Calibration audit | `roadmap/wave-80-edge-confidence/phase-a-calibration.md` (new) | Calibration table written |
| B | Parser-side confidence emission | `indexingPipelineCallResolution.ts`, `graphDatabaseTypes.ts` | Tests pass; each path asserts expected confidence range |
| C | Forced reindex + distribution check | `indexingPipeline.ts`, `graphDatabaseHelpers.ts` | Distribution SQL returns non-uniform histogram |
| D | Query-engine `minConfidence` param | `queryEngine.ts`, `queryEngineTypes.ts`, `graphControllerCompatQueries.ts`, `mcpToolHandlerHelpers.ts` | Existing callers unchanged; new param accepted |
| E | Schema disclosure | `mcpToolHandlerDefs.ts`, `mcpToolHandlers.ts` | `get_graph_schema` output includes confidence description |
| F | Manual smoke + result brief | `roadmap/wave-80-edge-confidence/wave-80-auto-brief.md` | Smoke checklist signed |

---

## Phase ordering

Phases execute A → B → C → D → E → F. B requires A's calibration table. C requires B (needs real confidence values to verify). D and E require C (so the db has real data to query against). F is always last.

---

## Risks

| Risk | Mitigation |
|---|---|
| Heuristic numbers are wrong; agents over-filter real callers | `minConfidence` default = 0 (no filter). Opt-in only. |
| Reindex cost surprises on first launch | Accept gradual refresh via auto-sync as fallback; forced reindex via `index_repository` tool always available |
| Wave 77 also touches `mcpToolHandlerDefs.ts` | Worktrees isolate. Semantic overlap is additive (Wave 77 adds `supportedCypherFeatures`; Wave 80 adds confidence description). No structural conflict. |
| `GraphEdge` type doesn't carry `confidence` to call-resolution emitter | Phase B adds it; `insertEdges` already stores `confidence` column in DB |

---

## Test coverage by phase

| Phase | Tests |
|---|---|
| A | None (read-only audit) |
| B | `indexingPipelineCallResolution.test.ts` — one fixture per resolution path; assert confidence in expected range |
| C | Manual SQL verification against indexed DB; no new automated test |
| D | `queryEngine.test.ts` — call `traceCallPath` with `minConfidence: 0.8`; assert low-confidence edges filtered; assert `minConfidence: 0` returns all |
| E | No new automated test; `get_graph_schema` output checked in Phase F smoke |
| F | Manual smoke |

---

## Acceptance criteria

1. `indexingPipelineCallResolution.ts` emits `confidence` on each CALLS/ASYNC_CALLS edge with a value from the Phase A calibration table (not hardcoded 1.0 for all).
2. After reindex: `SELECT confidence, COUNT(*) FROM edges WHERE type='CALLS' GROUP BY ROUND(confidence, 1)` returns at least 2 distinct confidence buckets.
3. `traceCallPath({ functionName: 'X', minConfidence: 0.8 })` filters edges below 0.8; `minConfidence: 0` (default) returns all edges (same as before).
4. `searchGraph({ minConfidence: 0.8 })` filters graph nodes reachable only via low-confidence edges.
5. `get_graph_schema` output includes a line describing the `confidence` field and its calibrated meaning.
6. No existing caller of `traceCallPath` or `searchGraph` breaks (default behavior is identical to pre-wave).

---

## Verification

### Data-shape probes

| Phase | Probe |
|---|---|
| B | Unit test: `callResolutionPass` with mock file having import-resolved call → edge has `confidence >= 0.95` |
| B | Unit test: same-file-definition resolution → `confidence >= 0.85` |
| B | Unit test: single-global-match resolution → `confidence >= 0.85` |
| B | Unit test: name-collision (multiple candidates) resolution → `confidence` in 0.5–0.75 |
| C | SQL: distribution shows at least 2 distinct buckets |
| D | Unit test: `traceCallPath` with `minConfidence: 0.8` returns fewer nodes than `minConfidence: 0` on a fixture with mixed confidence edges |

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| A | Internal — no observation point | (calibration table written to disk) | Phase A is a read-only audit deliverable |
| B | Internal — no observation point | Unit tests pass; confidence values emitted but not yet surfaced to user |
| C | Internal — no observation point | SQL probe on the indexed DB confirms distribution |
| D | Internal — no observation point | Unit tests confirm filter behavior |
| E | Developer using `get_graph_schema` MCP tool | Claude Code session → `get_graph_schema` call → MCP response text | Response text includes "confidence: float, 0.0–1.0. CALLS edges: import-resolved ~1.0, name-collision ~0.6" or similar |
| F | Developer using `trace_call_path` with `minConfidence` | Claude Code session → `trace_call_path({ symbol: 'X', minConfidence: 0.8 })` MCP call | Response shows fewer edges than without `minConfidence`; low-confidence collision edges absent |

---

## Files the next agent should read first

1. `src/main/codebaseGraph/indexingPipelineCallResolution.ts` — call resolution logic (Phase B)
2. `src/main/codebaseGraph/graphDatabaseTypes.ts` — `GraphEdge` type (needs `confidence` field added for emitter)
3. `src/main/codebaseGraph/graphDatabaseHelpers.ts` — `insertEdges` — verify it already writes `confidence` column
4. `src/main/codebaseGraph/queryEngine.ts` — `traceCallPath`, `detectChanges` signatures (Phase D)
5. `src/main/codebaseGraph/queryEngineTypes.ts` — type defs to extend for `minConfidence`
6. `src/main/codebaseGraph/graphControllerCompatQueries.ts` — consumer-facing call to `traceCallPath` (needs parameter threading)
7. `src/main/codebaseGraph/mcpToolHandlerHelpers.ts` — `handleTraceCallPath`, `handleDetectChanges` (Phase D)
8. `src/main/codebaseGraph/mcpToolHandlerDefs.ts` — `handleGetGraphSchema` (Phase E)
9. `src/main/codebaseGraph/mcpToolHandlers.ts` — tool schema for `trace_call_path`, `search_graph`, `detect_changes` (Phase D+E)
10. `roadmap/wave-80-edge-confidence/phase-a-calibration.md` — calibration table (Phase B prerequisite)

---

## Note to the implementer

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

For Phases A through D, the observation points are marked "Internal — no observation point." In those phases, unit tests + static analysis are the available gates; this is declared and acceptable. Phase E and F have real tool-call observation points — verify them before marking done.

---

## Orchestrator dispatch checklist

- [ ] Phase A: calibration audit — write `phase-a-calibration.md`
- [ ] Phase B: implement confidence emission in `indexingPipelineCallResolution.ts`; write tests
- [ ] Phase C: trigger reindex; run SQL distribution check
- [ ] Phase D: add `minConfidence` to query engine + handlers + tool schemas
- [ ] Phase E: update `get_graph_schema` output + `mcpToolHandlerDefs.ts`
- [ ] Phase F: manual smoke + result brief
- [ ] `/review 80` — mechanical gap-check; write `wave-80-mechanical-review.md`
- [ ] Push branch
