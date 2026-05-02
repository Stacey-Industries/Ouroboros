# Wave 70 — Result Brief

**Title:** Context injection completion + graph MCP envelope migration + telemetry archival
**Status:** Shipped
**Dates:** 2026-05-02 (single session)
**Branch:** `master` (commits `2533e19`, `5c4753d`, `98db48f`)

## What shipped

### Phase A — Context injection completion

- **A1:** `request.model` now threads through `enrichPacketWithContextLayer` so the model-aware repo-map budget table (`repoMapBudgets.ts`) applies the right tier per request. Pre-Wave-70 every model received the default Haiku-sized 8 KB budget because `request.model` was dropped at `contextPacketBuilder.ts:155`. Tier table:

  | Model | Repo-map budget |
  |---|---|
  | Opus | 16 KB / 4K tokens |
  | Sonnet | 12 KB / 3K tokens |
  | Default (Haiku) | 8 KB / 2K tokens |

- **A2:** `startContextRetrainTrigger` wired at startup behind the new `contextRanker.autoRetrainEnabled` config flag (default `true`). Trainer script resolved via dev / `process.resourcesPath` (matches `router/retrainTrigger` pattern). Stops cleanly on `app:will-quit` via `mainShutdown.ts:closeSyncStores`.

  **Pre-existing date-rotation mismatch fixed in the same change.** The retrain trigger was designed to watch a single `context-outcomes.jsonl` file, but `contextOutcomeWriter.ts` (Wave 29.5 M2) rotates by date. Extended `countRows` (TS) and `load_jsonl` (Python `train-context.py`) to glob across all `context-{outcomes,decisions}-YYYY-MM-DD[.N].jsonl` files in `userData` when given a directory path. Without this, the trigger as wired would only have seen today's file — never accumulating to threshold.

  **Soak gate impact.** Wave 31's soak conditions (≥1000 outcomes + held-out AUC > 0.75 + shadow-mode A/B overlap ≥80%) were unreachable pre-Wave-70 because no retrain ever ran in production. Phase A2 unblocks the soak. New `[context-ranker] retrain succeeded samples=N auc=0.xx version=<ISO>` log lines start appearing on outcome accumulation.

### Phase B — Graph MCP envelope migration + cleanup

- **B1 (envelope):** `McpToolDefinition.handler` now returns the MCP `CallToolResult` envelope per spec 2025-11-25 (`{content: ContentBlock[], isError?, structuredContent?}`). Pre-Wave-70 handlers returned `Promise<string>` and the standalone server wrapped with hardcoded `isError: false`. Handlers can now signal soft errors (e.g. `index_status` flagging `isError` when the project is not indexed) without throwing.

- **B2 (structured content):** Four naturally-structured tools now include `structuredContent`:
  - `index_status` → `{project, indexed, root, indexedAt, totalNodes, totalEdges, nodeCountsByLabel, edgeCountsByType, parseAnomalies}`
  - `get_architecture` → `{project, aspects: Record<string, ...>}`
  - `detect_changes` → `{changedFiles, changedSymbols, impactedCallers, riskSummary}`
  - `query_graph` → `{columns, rows, total}`

- **B3 (alias cleanup):** Dropped four deprecated parameter aliases (1+ wave-windows past their soft-deprecation):
  - `search_graph`: `name_pattern` → `query` only
  - `get_code_snippet`: `qualified_name` → `symbol` only
  - `trace_call_path`: `function_name` → `symbol` only
  - `manage_adr`: `adr_id` → `id` only

- **B4 (parseAnomalies always-emit):** `index_status` now emits `parseAnomalies: { count: 0, files: [] }` always. Pre-Wave-70 the field was omitted on count=0; agents could not distinguish "no anomalies" from "field absent / indexer regressed."

- **Refactor:** `handleIndexStatus` and `handleGetArchitecture` extracted to a new `mcpToolHandlerStructured.ts` to keep `mcpToolHandlerDefs.ts` under the 300-line cap.

- **Standalone passthrough:** `ouroborosMcpServer.ts:117` now returns the handler's envelope unchanged instead of wrapping with `isError: false`.

### Phase C — Telemetry archival completion

- **C1:** **already done in Wave 41 Phase F.** `initTraceBatcher` is called at `telemetryStore.ts:330` inside `initTelemetryStore`, and `drainTraceBatcher` at line 340 inside `closeTelemetryStore`. The plan's claim that the batcher lifecycle was unwired was stale (verified 2026-05-02).

- **C2 (JSONL archive revival):** `telemetryJsonlMirror.ts` was deleted in Wave 41 Phase F because no production caller existed. Revived in Wave 70 with retention disabled (10-year defensive ceiling). Wired into `openTelemetryStore` so every event dual-writes:
  - SQLite hot tier — 30-day retention (cache eviction, not data loss)
  - JSONL cold tier — `events-YYYY-MM-DD.jsonl`, retention disabled

  Mirror IO failures never block SQLite enqueue (fire-and-forget). User-stated requirement satisfied: historical telemetry preserved indefinitely.

- **C3 (auto_vacuum):** Added `PRAGMA auto_vacuum = INCREMENTAL` to `TELEMETRY_SCHEMA_SQL` so 30-day-purged rows release pages back to the free-list. WAL journal mode and the daily `purgeRetainedRows` schedule were already wired in Wave 41 Phase F.

- **C4 (gzip task):** `compressOldFiles(dir)` runs on a 24h `setInterval`, compressing files older than 1 day to `.jsonl.gz` (~10× compression). Today's live file is never touched. Estimated disk: ~50 MB/year compressed (~500 MB/decade — negligible).

## Tests

- **New:** 7 in `contextRetrainStartup.test.ts`, 3 in `contextPacketBuilderModelThreading.test.ts`, 11 in `mcpToolHandlerStructured.test.ts`, 6 in `telemetryJsonlMirror.test.ts` = **27 new tests**, all green.
- **Wave-70 surface:** 1762 tests across `src/main/orchestration`, `src/main/codebaseGraph`, `src/main/telemetry`, `src/standalone` — all green.
- **Pre-existing failures (NOT introduced by Wave 70):** 32 failures in `subagentTracker.test.ts`, `subagent.test.ts`, `channelCatalogCoverage.test.ts`, `mobile-touch-targets.test.ts`, `TitleBar.menus.test.ts`, two `ChatOnlyShell.integration` files. Verified failing on `HEAD~3` (master before any Wave 70 commit).
- **Lint:** 0 errors, 7 pre-existing warnings.
- **Typecheck:** clean (`tsc --noEmit -p tsconfig.node.json`).

## Soak gate / follow-up

- **Wave 31 graduation tracker:** when `~/.ouroboros/context-outcomes-*.jsonl` accumulates ≥1000 rows AND `[context-ranker] retrain succeeded` lines show held-out AUC > 0.75 stabilized AND shadow-mode A/B overlap ≥ 80%, flip `context.learnedRanker → true` in a future wave. Phase A2 is the prerequisite that drives this — pre-Wave-70 the soak was effectively frozen.
- **Telemetry JSONL operator UX:** `compressTelemetryJsonl(dir)` and `purgeTelemetryJsonl(dir, days)` are exported from `src/main/telemetry/index.ts` for ad-hoc operator scripts. Defer surfacing in Settings until volume warrants.

## ADR

`roadmap/decisions/wave-70.md` — Decisions 1 (telemetry tier choice), 2 (envelope migration), 3 (alias cleanup, no soft-deprecate), 4 (parseAnomalies always-emit pattern), 5 (auto-retrain on soak path, not dormant), 6 (model-aware budget threading).

## Files changed

```
docs/context-ranker.md                                            (auto-retrain section)
roadmap/decisions/wave-70.md                                      (new ADR)
roadmap/auto-briefs/wave-70-result.md                             (this brief)
roadmap/archive/wave-70-context-injection-completion.md           (moved from future/)
roadmap/archive/wave-70-graph-mcp-polish.md                       (moved from future/)
roadmap/archive/wave-70-telemetry-archival-completion.md          (moved from future/)
src/main/configAppTypes.ts                                        (autoRetrainEnabled)
src/main/configSchemaTailExt.ts                                   (autoRetrainEnabled)
src/main/main.ts                                                  (wire startup)
src/main/mainShutdown.ts                                          (wire shutdown)
src/main/orchestration/contextPacketBuilder.ts                    (A1 thread model)
src/main/orchestration/contextRetrainStartup.ts                   (new, A2)
src/main/orchestration/contextRetrainStartup.test.ts              (new)
src/main/orchestration/contextRetrainTriggerHelpers.ts            (dir-glob)
src/main/orchestration/contextPacketBuilderModelThreading.test.ts (new)
src/main/internalMcp/internalMcpTypes.ts                          (envelope)
src/main/codebaseGraph/mcpToolHandlers.ts                         (envelope wrap)
src/main/codebaseGraph/mcpToolHandlerDefs.ts                      (re-export, drop alias)
src/main/codebaseGraph/mcpToolHandlerHelpers.ts                   (envelope, drop aliases)
src/main/codebaseGraph/mcpToolHandlerStructured.ts                (new)
src/main/codebaseGraph/mcpToolHandlerStructured.test.ts           (new)
src/main/codebaseGraph/mcpToolHandlerDefs.test.ts                 (envelope tests)
src/main/codebaseGraph/mcpToolHandlerHelpers.test.ts              (drop alias tests)
src/main/contextLayer/repoMapGenerator.graph.integration.test.ts  (drive-by import sort)
src/main/telemetry/index.ts                                       (re-export mirror)
src/main/telemetry/telemetryJsonlMirror.ts                        (revived)
src/main/telemetry/telemetryJsonlMirror.test.ts                   (new)
src/main/telemetry/telemetryStore.ts                              (wire mirror)
src/main/telemetry/telemetryStoreHelpers.ts                       (auto_vacuum)
src/standalone/ouroborosMcp/ouroborosMcpServer.ts                 (envelope passthrough)
tools/train-context.py                                            (dir-glob load_jsonl)
```
