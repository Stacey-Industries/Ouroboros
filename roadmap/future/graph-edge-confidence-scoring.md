# Graph edge confidence scoring — call-resolution edges

**Status:** WAVE-IT — moderate single wave
**Source:** `roadmap/audit-verification-pass.md` Section D item #13 (Wave 67/68 follow-up)
**Filed:** 2026-05-01

## Relation to other graph waves

This wave is a **sibling** to Wave 67, not a duplicate. Both touch call-resolution accuracy in `treeSitterParserCalls.ts` / `indexingPipelineCallResolution.ts`, but they address different defects:

| Wave | Defect | Symptom |
|---|---|---|
| **Wave 67 — Indexer Definition-Pass Coverage Repair** | Some source files produce **zero definition nodes** in the graph due to a pipeline orchestration bug | Files exist as File nodes but their classes/functions are silently absent. `get_code_snippet({symbol: 'GraphDatabase'})` returns nothing despite the class existing. |
| **This wave — Confidence Scoring** | All `CALLS` edges are written with `confidence = 1.0` regardless of how confident the parser actually was | Agents can't distinguish import-resolved calls from name-collision guesses; impact analysis treats all edges as equally reliable |
| **Wave 68 — Cypher Engine Quality** (separate plan) | Various Cypher engine bugs (`r.props` access, `labels()` silent drop, etc.) | Query-time issues, not data-emission issues |

**Sequencing recommendation:** Land *after* Wave 67. Wave 67 fixes which calls get emitted; this wave fixes how reliably they're scored. Doing this first would mean re-tuning confidence heuristics once Wave 67 changes the population of edges. Doing it after means one stable indexer pass produces both correct coverage *and* correct confidence.

If Wave 67 is still pending and someone wants to ship this in parallel, Phase A here can proceed independently (the heuristic table doesn't depend on Wave 67 outcomes); only Phase C (forced reindex) needs to coordinate.

## Background

The graph stores edges with a `confidence REAL NOT NULL DEFAULT 1.0` column (added in schema migration v2 — `graphDatabaseSchema.ts:59`). The intent: not all edges are equally reliable, so the storage should reflect that.

Some passes already use real confidence:
- `httpLinkPass` — scores 0.0–1.0 based on method match + caller-name/route-path string similarity
- (others likely as the schema/passes evolve)

But the most common edge type — `CALLS` edges produced by tree-sitter parsing in `treeSitterParserCalls.ts` and `indexingPipelineCallResolution.ts` — **always gets the default `1.0`**, regardless of how confident the parser actually was.

## Why call resolution has gradations of confidence

When the parser sees `foo(...)` in source code, it tries to link the call to a definition. There are several resolution paths, each with different reliability:

| Resolution path | What happened | Real confidence |
|---|---|---|
| **Import-resolved** | `import { foo } from './bar'` — single named function definitively imported | High (~1.0) |
| **Method on typed object** | `obj.foo()` where `obj`'s type is fully resolved | High (~0.95) |
| **Name-unique** | Only one `foo` function in the entire repo | High (~0.9) |
| **Name-collision** | Multiple functions named `foo` exist; parser picks one based on heuristics | Medium (~0.6–0.7) |
| **Method on untyped object** | `obj.foo()` where `obj`'s type is unknown — name-based guess | Lower (~0.5) |
| **Dynamic dispatch** | `window[fn]()`, function-as-argument, `eval()` | Lowest (~0.3) or skip entirely |

(These numbers are starting points. Phase A calibrates them against real data.)

All of these currently land in the graph as `confidence = 1.0`. Agents can't tell apart "definitively this is the caller" from "statistical guess that could be wrong."

## Why this matters

Three downstream consumers are degraded:

1. **`trace_call_path` accuracy** — the agent asks "who calls X?" and gets back N results. Without confidence, it can't filter to "definite callers only" vs "probable callers." On a codebase with name collisions, the difference is the difference between accurate impact analysis and noise.

2. **Refactor blast radius** — `detect_changes` does *"topology-based risk classification (CRITICAL → LOW)"*. That ranking improves substantially when low-confidence edges can be down-weighted in the traversal.

3. **Dead code detection** — a function whose only callers are low-confidence guesses is more likely actually dead than one with high-confidence import-resolved callers. Currently both look identical to any consumer.

The auto-router (Wave 31) and any future ML model trained on the graph also benefit from confidence-weighted features instead of treating all edges as ground truth.

## Scope

**In scope:**
- Confidence emission in tree-sitter call resolution (`treeSitterParserCalls.ts`, `indexingPipelineCallResolution.ts`)
- Heuristic confidence levels per resolution path (calibrated in Phase A)
- Optional `minConfidence` filter param on `searchGraph`, `trace_call_path`, `detect_changes`
- Confidence exposed in returned edge data
- `get_graph_schema` advertises the field + meaning so agents can use it
- One-time forced reindex on first launch with the new code (or accept gradual refresh via auto-sync)

**Out of scope:**
- Confidence on non-CALLS edges (already handled by their respective passes; if any are missing, separate item)
- Re-tuning the heuristic confidence numbers post-launch (telemetry-driven; future wave)
- Visualizing confidence in the renderer (UI surface decision; out-of-scope for the data layer wave)
- Changing `httpLinkPass` confidence model (already works)

## Phases

| Phase | Topic | Notes |
|---|---|---|
| **A** | Calibrate heuristic confidence levels | Read-only audit. Sample ~50 real `CALLS` edges across the indexed graph; manually classify each by resolution path; produce the calibrated confidence table that goes into the parser. Deliverable: `roadmap/wave-NN-confidence-calibration.md`. |
| **B** | Parser-side confidence emission | Modify call-resolution code to compute and emit a confidence value alongside each `CALLS` edge. Tests: each resolution path has a fixture and asserts the expected confidence range. |
| **C** | Forced reindex + storage verification | Existing graphs have all-1.0 confidence. Either trigger a one-time reindex or accept gradual refresh. Verify: `SELECT confidence, COUNT(*) FROM edges WHERE type='CALLS' GROUP BY ROUND(confidence, 1)` shows a distribution, not all 1.0. |
| **D** | Query-engine support | Add `minConfidence` param to relevant query-engine entry points. Default behavior unchanged — existing callers see the same results. New callers can opt into filtering. |
| **E** | Schema disclosure + tests | `get_graph_schema` advertises `confidence` field on edges with the calibrated meaning. Update `mcpToolHandlerDefs.ts` tool descriptions where relevant. |
| **F** | Manual smoke + result brief | Probe `trace_call_path` on a function with known name collisions; confirm low-confidence edges are now visible/filterable. |

## Risks

| Risk | Mitigation |
|---|---|
| Heuristic numbers in Phase A are wrong, agents over-filter and miss real callers | Default `minConfidence` is 0 (no filter) — opt-in. Calibration uses real samples, not guesses. Telemetry post-launch refines. |
| Reindex cost on first launch with new code | Option to defer to gradual refresh; can be triggered manually via existing `index_repository` tool |
| Confidence-aware queries become a footgun for agents that don't know to use them | Phase E surfaces it in `get_graph_schema`; agents that read schema first will know |
| Other passes (e.g. `testDetectPass`, `gitCoChangePass`) also emit `confidence = 1.0` and need their own pass | Out of scope for this wave; flag as future audit item if true |

## Connection to telemetry

If/when Wave 70 (telemetry archival completion) lands and `traceBatcher` captures real query traces, the JSONL archive will have a corpus of `trace_call_path` results. Phase A's calibration could in principle use that corpus instead of manual sampling — but it's premature; manual sampling on ~50 edges is cheap and doesn't block on Wave 70.

## References

- `src/main/codebaseGraph/graphDatabaseSchema.ts:59` — `confidence REAL NOT NULL DEFAULT 1.0` schema column (migration v2)
- `src/main/codebaseGraph/treeSitterParserCalls.ts` — call extraction (currently no confidence)
- `src/main/codebaseGraph/indexingPipelineCallResolution.ts` — post-parse call-edge resolution (currently no confidence)
- `src/main/codebaseGraph/passes/httpLinkPass.ts` — example of a pass that DOES use real confidence
- `src/main/codebaseGraph/queryEngine.ts` — `searchGraph`, `trace_call_path` (need `minConfidence` param)
- `src/main/codebaseGraph/mcpToolHandlerDefs.ts` — `get_graph_schema` tool definition (needs confidence advertising)
- Audit: `roadmap/audit-verification-pass.md` Section D item #13
- **Sibling wave: `roadmap/wave-67-indexer-coverage-repair.md`** — fixes which calls get emitted; this wave fixes how reliably they're scored
- **Adjacent wave: `roadmap/wave-68-cypher-engine-quality.md`** — Cypher engine bugs, separate concern
