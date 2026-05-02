# Wave 70 — Architectural Decisions

Bundles three audit follow-ups: context-injection completion, graph-MCP polish, telemetry archival. Upfront decisions captured during plan revision; finalized at wave close.

## Decision 1: revive `telemetryJsonlMirror`, do not redesign the cold tier

**Context:** Wave 41 Phase F (commit `cfe1f80`) deleted `telemetryJsonlMirror.ts` because it had no production callers. The audit-verification-pass reframed the original Wave 15 plan as "permanent archive" (preserve indefinitely) rather than "30-day rotation". The user confirmed the underlying need: historical telemetry should be preserved indefinitely, not purged.

**Options considered:**
- *Industry standard:* hot/cold tiered storage — SQLite hot tier (30-day window for the auto-router's working set) + JSONL cold tier (daily-rotated, gzipped, retention disabled). Direct revival of the deleted module with retention set to "forever" (10-year ceiling as defensive cap).
- *Emerging best practice:* OTLP-shape JSONL compatible with `OpenTelemetry File Exporter`, so the cold archive could be ingested by external observability tools later. Adds schema-translation layer at write time.
- *Cutting-edge:* Parquet/DuckDB cold tier for analytical queries on archive. Overkill at ~50 MB/year compressed volume.

**Pick:** Industry standard — revive `telemetryJsonlMirror` with retention disabled (10-year ceiling).

**Rationale:** OTLP-shape would force a schema rewrite for marginal benefit; the cold archive is for in-product future analyses (router calibration, ranker retrain), not external ingest. Parquet/DuckDB volume threshold is two orders of magnitude beyond ours. The deleted module's design (daily rotation, 10 MB cap with sub-rotation, append-only line-level atomicity) is sound — bring it back rather than redesign.

**Consequences:** `src/main/telemetry/telemetryJsonlMirror.ts` reappears. Daily gzip task added: files older than 1 day compress to `.jsonl.gz`. `purgeOldFiles` is NOT scheduled (or scheduled at 3650-day retention). Disk growth bounded at ~50 MB/year compressed. SQLite 30-day purge stays — it's the hot-tier cache eviction, not data loss.

---

## Decision 2: MCP `CallToolResult` envelope migration with opportunistic `structuredContent`

**Context:** `McpToolDefinition.handler` currently returns `Promise<string>`. The standalone server (`ouroborosMcpServer.ts:117`) wraps strings into `{content:[{type:'text',text}], isError:false}` at the boundary, hardcoding `isError: false`. This diverges from the MCP spec 2025-11-25 `CallToolResult { content: ContentBlock[], isError?: boolean, structuredContent?: object }`.

**Options considered:**
- *Industry standard:* migrate `handler` return type to `Promise<{content, isError?}>`. Server passes through unchanged. Aligns with current MCP spec.
- *Emerging best practice:* also support `structuredContent: object` for tools that return naturally structured data (`index_status`, `detect_changes`, `query_graph`, `get_architecture`). Spec recommends dual format: structured PLUS backward-compat text serialization.
- *Cutting-edge:* full output-schema validation (define `outputSchema` per tool, validate `structuredContent` matches at runtime). MCP spec mentions but doesn't require.

**Pick:** Industry standard for the envelope migration. Add `structuredContent` opportunistically for the four naturally-structured tools.

**Rationale:** The four tools above already produce JSON-shaped data internally that gets text-formatted for return; including the underlying object as `structuredContent` is essentially free and lets agent consumers parse without regex. Output-schema validation is overkill for an internal tool surface — defer until external consumers exist.

**Consequences:** `McpToolDefinition.handler` returns `Promise<McpToolResult>`. All 12 graph-tool handlers and the standalone passthrough updated. The four structured tools include `structuredContent`. No external compatibility break — Claude Code MCP clients accept the new envelope natively. Source citation: `modelcontextprotocol.io/specification/2025-11-25/schema` (CallToolResult).

---

## Decision 3: drop deprecated parameter aliases without soft-deprecate phase

**Context:** Wave 66 ADR Decision 2 introduced parameter renames with deprecated aliases retained for "one wave window." Window has been 4+ waves old. Plan suggested a soft-deprecate Phase A (log a deprecation message before removal).

**Pick:** Skip soft-deprecate. Drop directly.

**Rationale:** No external consumers exist for these tool names — only Claude Code in the same machine, all under Ouroboros control. The MCP description already marks the aliases as deprecated. A deprecation-log soak window has no observable population to warn.

**Consequences:** `name_pattern`, `qualified_name`, `function_name`, `adr_id` removed from `TOOL_SCHEMAS` in a single change. Handler-side fallback resolution removed too. Models in flight that use the old names get a schema-rejection error rather than silent behavior change — acceptable, the MCP description directs them to the new names.

---

## Decision 4: `parseAnomalies` always-emit follows the present-but-empty pattern

**Context:** `index_status` currently omits `parseAnomalies` when count is zero. Agents reading the response cannot distinguish "no anomalies" from "field absent" or "indexer regressed."

**Pick:** Industry standard — emit `parseAnomalies: { count: 0, files: [] }` always. Zero is a positive signal, not an absence.

**Rationale:** Standard observability pattern: explicit zero beats implicit null. Cost is one line in the JSON; benefit is robust diff-monitoring of indexer health.

**Consequences:** Both the text format (`Parse anomalies: 0 files with no definitions`) and the `structuredContent.parseAnomalies` field are present always. Consumers that test `if (response.parseAnomalies)` for truthy must update — but `count === 0` is still falsy under truthy-array-existence checks; only naive `if (response.parseAnomalies)` (object-existence) breaks, and that test pattern is wrong anyway.

---

## Decision 5: auto-retrain wire-up is on the soak path, not dormant

**Context:** Phase B of the context-injection-completion plan wires `startContextRetrainTrigger`. Initial concern was that retrained weights swap into `contextClassifier` but the classifier only drives ranking when `context.learnedRanker = true` (default `false`). Question: is this dormant work?

**Pick:** Wire it. Not dormant — it is the driver of the Wave 31 soak.

**Rationale:** With `learnedRanker = false`, the classifier runs in shadow mode (`contextSelectorRanker.runShadowMode`) — scoring files in parallel and logging A/B telemetry without affecting ranking. The retrain trigger ensures the shadow-mode classifier scores against fresh weights, which produces the AUC + overlap signals the soak gates need. Without it, shadow mode runs against stale Wave-31 bundled defaults forever.

**Consequences:** `[context-ranker] weights reloaded version=<ISO> auc=<x>` log lines start appearing on outcome accumulation. Settings → Context Ranker dashboard shows fresh versions instead of `BUNDLED_CONTEXT_WEIGHTS`. Wave 31's soak conditions (≥1000 outcomes + AUC > 0.75 + overlap ≥ 80%) become the close-out gate for a future "flip `context.learnedRanker → true`" wave. New config flag `contextRanker.autoRetrainEnabled` (default `true`) for kill-switch capability.

---

## Decision 6: model-aware repo-map budget is a 1-line wire fix, no spectrum needed

**Context:** `contextPacketBuilder.ts:155` calls `enrichPacketWithContextLayer(packet, request.goal)` and drops `request.model`. The `enrichPacket` interface accepts an optional `model?: string` parameter — and uses it to pick from a model-aware budget table (`repoMapBudgets.ts`). Today every model gets the Haiku-sized 8 KB budget regardless of tier.

**Pick:** Thread `request.model` through. Single line + test.

**Rationale:** Pure infrastructure-completion. The model-aware budget table already exists and is tested. The only change is connecting it to the actual model identifier from the request.

**Consequences:** Opus-tagged requests get 16 KB / 4K-token repo-map slices. Sonnet gets 12 KB / 3K. Default falls through to 8 KB / 2K as before. No regression risk — `model: undefined` continues to use the default.

---

## End-of-wave additions

Filled in at wave close (2026-05-02).

### Decision 7: extend retrain trigger to glob date-rotated files (mid-wave)

**Context:** During Phase A2 implementation, discovered the retrain trigger was designed to watch a single `context-outcomes.jsonl` file, but `contextOutcomeWriter.ts` (Wave 29.5 M2) writes date-rotated files. Without an extension, the wire-up would have been hollow — the trigger would only see today's file.

**Pick:** Smallest-diff dir-glob extension. `countRows` (TS) and `load_jsonl` (Python) both accept either a single file or a directory; when given a directory, glob `context-{outcomes,decisions}-YYYY-MM-DD[.N].jsonl` and aggregate.

**Rationale:** Alternative was to introduce a separate "retrain trigger v2" with a directory-watch loop. Bigger change, more surface to test. The single-file API stays unchanged — directory mode is a strict superset.

**Consequences:** Trainer sees the full corpus across all rotated files. The trigger's `fs.watch(dir)` fires on any file change in the directory (the watcher already handles the file-not-yet-existing case with `error → noop`). No back-compat break for existing test fixtures (single-file mode unchanged).

### Decision 8: HIGH-A (initTraceBatcher) skipped — already wired in Wave 41 Phase F

**Context:** The audit-verification-pass plan (filed 2026-05-01) identified HIGH-A — `initTraceBatcher`/`drainTraceBatcher` lifecycle unwired in production. Verified during Phase C that this was incorrect: Wave 41 Phase F (commit `cfe1f80`) wired both at `telemetryStore.ts:330` and `:340` inside `initTelemetryStore`/`closeTelemetryStore`.

**Pick:** Skip HIGH-A from Phase C. Document in ADR.

**Rationale:** The plan was working from `archive/waves-15-29-review-addendum.md` which predated Wave 41 Phase F by ~12 waves. Verifying the live code before acting is non-optional per `~/.claude/CLAUDE.md`.

**Consequences:** Phase C scope reduced from four items to three (C2, C3, C4). HIGH-D (`purgeRetainedRows` scheduling) was also already wired by Wave 41; only the `auto_vacuum = INCREMENTAL` PRAGMA addition remained.
