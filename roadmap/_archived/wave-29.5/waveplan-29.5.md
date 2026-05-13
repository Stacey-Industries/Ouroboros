# Wave 29.5 — Data Foundation Repair

## Implementation Plan

**Version target:** v1.9.2 (patch)
**Feature flag:** None — telemetry is already gated by `telemetry.structured` (existing).
**Dependencies:** Wave 15 (telemetry schema), Wave 24 (context decision logging), Wave 25 (research pipeline + correlation store).
**Blocks:** Wave 30 (auto-firing research), Wave 31 (learned context ranker). Do not start either until this wave lands.

**Origin:** `roadmap/data-foundation-audit.md` (2026-04-16, Opus 4.7 High). Five issues (C1, C3, C4, H1, H3) are load-bearing for Wave 30/31 training; the rest are polish that can ride in the same wave cheaply.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **C1 — Correlation-id propagation.** Mint `correlationId` in main when the hook payload lacks one; pair `pre_tool_use`/`post_tool_use` on `(sessionId, toolUseId)`; fix `outcomeObserver` so `eventId` is the actual row id, not the correlationId. Update synthetic-event emitters in `chatOrchestrationBridgeMonitor.ts` to mint `correlationId` too. | `src/main/hooks.ts`, `src/main/telemetry/outcomeObserver.ts`, `src/main/telemetry/telemetryStore.ts`, `src/main/agentChat/chatOrchestrationBridgeMonitor.ts`, `src/main/agentChat/chatOrchestrationBridgeSupport.ts` |
| B | **H1 — Unconditional `traceId` at packet build.** Mint `traceId` in `contextPacketBuilder.ts` when no router decision supplies one; router annotates when present. Remove the `routerConfig?.enabled` gate in `chatOrchestrationRequestSupport.ts:73`. Touches `registerSessionTrace` call path. | `src/main/orchestration/contextPacketBuilder.ts`, `src/main/agentChat/chatOrchestrationRequestSupport.ts`, `src/main/router/routerOutcomeWriter.ts` (verify ID shape) |
| C | **C3 + M4 — Outcome record shape.** Extend `ContextOutcomeRecord` with `traceId`, `fileId` (normalised same as `missed` path), `sessionId`, `timestamp`, `toolKind`. Normalise `fileId` for `used`/`unused` the same way as `missed`. Keep `decisionId` as optional for readback. Update `contextOutcomeObserver.ts:273-288` accordingly. | `src/main/orchestration/contextOutcomeWriter.ts`, `src/main/orchestration/contextOutcomeObserver.ts`, `src/main/orchestration/contextTypes.ts`, `src/main/orchestration/contextPacketBuilderDecisions.ts` |
| D | **H2 — `pagerank_score` wiring.** Attach `pagerank_score` to `RankedContextFile` at selection time by pulling from `graphController.getHotspotScore` (verify method name). Drop the `as unknown as Record` cast in `contextPacketBuilderDecisions.ts:37`. | `src/main/orchestration/contextSelector.ts`, `src/main/orchestration/contextSelectionSupport.ts`, `src/main/orchestration/contextPacketBuilderDecisions.ts`, `src/main/orchestration/typesContext.ts` |
| E | **C4 — Persist `research_invocations` to SQLite.** Call `telemetryStore.recordInvocation(...)` from `researchSubagent.ts:230` with `{ correlationId, sessionId, topic, triggerReason, hitCache, latencyMs, artifactHash: sha1(artifact.summary) }`. Add `recordInvocation` to the store (schema exists; writer does not). Keep in-memory correlation store for fast intra-session attribution. | `src/main/telemetry/telemetryStore.ts`, `src/main/telemetry/telemetryStoreHelpers.ts`, `src/main/research/researchSubagent.ts`, `src/main/research/researchCorrelation.ts` |
| F | **H3 — Outcome quality on research outcomes.** Extend `ResearchOutcomeRecord` with `toolKind: 'read'\|'edit'\|'write'\|'other'`, `outcomeSignal: 'accepted'\|'reverted'\|'unknown'` (joined from `chatOrchestrationBridgeGit.ts` revert events + agent-chat snapshot hashes), `followupTestExit: number \| null` (joined from the next PTY exit in the session via `outcomeObserver`). | `src/main/research/researchOutcomeWriter.ts`, `src/main/research/researchOutcomeTypes.ts`, `src/main/orchestration/contextOutcomeObserverResearch.ts`, `src/main/agentChat/chatOrchestrationBridgeGit.ts` (emit revert signal to writer) |
| G | **M2 — JSONL retention.** Date-stamp filenames (`context-decisions-YYYY-MM-DD.jsonl`, `context-outcomes-YYYY-MM-DD.jsonl`, `research-outcomes-YYYY-MM-DD.jsonl`). Time-based purge at 30 days. Training script globs `*.jsonl` in the directory. | `src/main/orchestration/contextDecisionWriter.ts`, `src/main/orchestration/contextOutcomeWriter.ts`, `src/main/research/researchOutcomeWriter.ts`, one new `jsonlRetention.ts` helper shared by all three |
| H | **H4 — Self-correction capture (Wave 25 back-fill).** Regex-based detector on user messages (`that's wrong`, `X doesn't work that way in Y`, `deprecated in Z`); library-name extraction; append to `corrections-YYYY-MM-DD.jsonl`. Expose per-session `Set<library>` for enhanced-research flag (consumed by `researchSubagent` in a later wave). | `src/main/research/correctionDetector.ts` (new), `src/main/research/correctionWriter.ts` (new), `src/main/research/correctionStore.ts` (new, in-memory), `src/main/agentChat/chatOrchestrationBridgeSend.ts` (hook in user-message path) |
| I | **C2 / C5 / M1 — Decide + document.** Drop unused SQLite tables (`context_decisions`, `context_outcomes`) from `telemetryStoreHelpers.ts` since Wave 31 trains over JSONL; mark Inspector "Decision viewer" as JSONL-backed in a code comment. Wire `recordTrace` calls into `providers/claudeCodeAdapter.ts` spawn/stdin/stdout paths so `orchestration_traces` has data for the Inspector Traffic tab. Populate `stderr_hash` in `outcomeObserver.onPtyExit` via a rolling stderr-tail hash. | `src/main/telemetry/telemetryStoreHelpers.ts`, `src/main/orchestration/providers/claudeCodeAdapter.ts`, `src/main/telemetry/outcomeObserver.ts`, `src/main/telemetry/telemetryStore.ts` |

**Phase order rationale:** A→B→C→D form a dependency chain (C1 fixes the `eventId`; H1 provides the `traceId` that C3 records; D completes the feature vector that C writes). E–H can land in parallel after D, except H3 depends on C1 (needs `eventId`) and F depends on the revert-signal path.

**Phase sizes:** A, C, E, F are the heaviest (~150-250 lines each across 3-4 files). B, D, G, H are lighter (~80-150 lines). I is a cleanup phase (<100 lines mostly deletions + a single wire-up function).

---

## Data contract changes

| Record | Before | After |
|--------|--------|-------|
| `ContextOutcomeRecord` | `{ id, decisionId, kind, toolUsed }` | `{ id, decisionId?, traceId, fileId, kind, toolKind, toolUsed?, sessionId, timestamp }` |
| `ContextDecisionRecord` | `{ id, traceId, fileId, features, score, included }` | unchanged (already correct) |
| `ResearchOutcomeRecord` | `{ correlationId, sessionId, topic, toolName, filePath, timestamp }` | `{ correlationId, sessionId, topic, toolName, toolKind, filePath, timestamp, outcomeSignal, followupTestExit }` |
| `research_invocations` SQLite row | (never written) | `{ correlationId, sessionId, topic, triggerReason, hitCache, latencyMs, artifactHash, timestamp }` |
| Hook `events` row | `correlationId: ''` (FK-invalid) | `correlationId: uuid-v4` (paired across `pre_tool_use`/`post_tool_use`) |
| `outcomes.event_id` | `''` (FK violation silently swallowed) | Actual `events.id` from the paired pre-tool event |

**Backward compat:** Old JSONL files from before this wave are unreadable by the new training script (missing `traceId`/`fileId`). Acceptable — the training set before this wave is unusable anyway (that's why the wave exists). Add a `schemaVersion: 2` field to the new records so `tools/train-context.py` can filter.

---

## Architecture notes

**Correlation id scheme (C1):** Claude Code's hook payloads already include a `tool_use_id` on `pre_tool_use` / `post_tool_use` pairs. Main process keys a short-TTL `Map<sessionId + toolUseId, correlationId>`. On `pre_tool_use` without a `correlation_id` field, mint one and store it. On `post_tool_use`, look up the pair's id. TTL of 10 minutes — if the pair never closes, the entry is evicted. External hook scripts do not need to change; the envelope is minted inside `hooks.ts` before `getTelemetryStore().record()` fires. Synthetic emitters in `chatOrchestrationBridgeMonitor.ts` always supply one.

**`eventId` vs `correlationId` fix (C1):** `telemetryStore.enqueueEvent` returns the row `id` (a fresh `randomUUID()`). `outcomeObserver.noteToolUseEvent` must store that row id, not the correlation id. Today it stores `rawPayload.correlationId ?? ''` (`hooks.ts:278`) and then uses that as `eventId`. Fix: pass the row id back from `record()` and thread it through `noteToolUseEvent`. Keep `correlationId` as a separate column for cross-channel joins (stream-json session id ↔ hook id ↔ synthetic id).

**`traceId` unconditional (H1):** `buildContextPacket` mints a `traceId` if the caller does not supply one. The router, when enabled, still calls `logRoutingDecision` — now it just annotates an existing id instead of creating one. `registerSessionTrace` is called with the `traceId` regardless of router state. Net effect: every packet build is a training sample, not just router-confident turns.

**`fileId` normalisation (C3):** Single helper `normaliseFileId(absPath, workspaceRoot)` — lowercase, forward-slash, workspace-relative. Used for **all** outcome records (used, unused, missed). The current path-vs-decisionId split in `contextOutcomeObserver.ts:273-288` collapses into one form.

**PageRank attachment (H2):** `contextSelector` already queries `graphController` for hotspot and blast-radius signals. Extend the same call to pull `pagerank_score`. If the graph controller doesn't expose it, add a `getPageRank(filePath): number | null` method to `graphController.ts`. Null is still possible for files outside the graph — train-context.py must handle that (zero-imputation is fine once the feature is non-null for most rows).

**Research invocation persistence (C4):** `telemetryStore.recordInvocation` is a thin wrapper around the existing `research_invocations` INSERT. Add `queryInvocations` mirror for the weekly dashboard. Keep `researchCorrelation.ts`'s in-memory map for the 10-minute attribution window — it's the right data structure for fast joins; SQLite is for durability.

**Outcome signal on research outcomes (H3):** The outcome observer already sees `onPtyExit`; pipe that into the research outcome writer so the 10-minute attribution window can stamp `followupTestExit`. For `outcomeSignal`, the agent-chat bridge's revert path (`chatOrchestrationBridgeGit.ts`) must emit a signal the writer can subscribe to: if a checkpoint revert happens within the attribution window on a file the research touched, mark `reverted`. Otherwise `accepted` if any Edit/Write touched it, `unknown` if only Reads.

**JSONL retention (M2):** One shared helper `jsonlRetention.purgeOlderThan(dir, globPattern, days)` runs at startup and on rotation. Filenames change to `${basename}-${YYYY-MM-DD}.jsonl`. Training scripts glob `${basename}-*.jsonl` instead of hard-coding a single filename.

**Self-correction detector (H4):** Kept deliberately simple in this wave — regex patterns against user message text, library name extraction via a small curated list (top-100 from Wave 19's library index). A richer classifier (LLM-based) is a later wave. Writes to `corrections-YYYY-MM-DD.jsonl` + in-memory `Map<sessionId, Set<library>>` cleared on session end.

**Dropped SQLite tables (C2):** `context_decisions` and `context_outcomes` tables are removed from `telemetryStoreHelpers.ts` DDL. Wave 31 trains over JSONL; any UI that needs SQL access reads via a JSONL→in-memory shim. Test fixtures in `telemetryStoreHelpers.test.ts:52` are updated.

**`orchestration_traces` wire-up (C5):** `claudeCodeAdapter.ts` gets three `recordTrace` calls: (1) on spawn (`kind: 'spawn'`, record argv + cwd hash), (2) per stdin chunk (`kind: 'stdin'`, record byte length + first 120 chars), (3) per stdout chunk (`kind: 'stdout'`, same shape). Cost on a warm path is ~1 SQLite insert per chunk; batch into a 500 ms micro-queue if the benchmark shows contention.

---

## ESLint split points to anticipate

- `hooks.ts` is already at ~340 lines. Phase A adds a correlation-id pairing map + paired lookup. Extract `hooksCorrelationPairing.ts` before committing — mirror the `chatOrchestrationBridge*.ts` split pattern.
- `telemetryStore.ts` at 296 lines; adding `recordInvocation` + row-id return on `record()` will exceed 300. Pre-split: move all query helpers into `telemetryStoreQueries.ts` (already partially exists as `telemetryStoreHelpers.ts`; verify namespace).
- `contextOutcomeObserver.ts` at 302 lines; Phase C adds more fields to each push site. Extract `buildContextOutcomeRecord()` helper.
- `contextSelector.ts` is the largest orchestration file — Phase D additions must go into `contextSelectionSupport.ts` not the top-level file.
- `providers/claudeCodeAdapter.ts` — verify current line count before Phase I; `recordTrace` hooks may need a sidecar.

---

## Risks

- **Hook-script version bump cascade (C1).** `hookInstaller.ts` content-hashes the hook scripts. If we have to modify any `.ps1` / `.sh` to emit `tool_use_id`, every existing install re-provisions. Mitigation: do not touch the hook scripts — mint the `correlationId` entirely inside `hooks.ts`. The scripts already forward `tool_use_id` via the Claude Code SDK envelope.
- **Silently FK-failing writes might be masking unrelated bugs.** The `try/catch` at `telemetryStore.ts:166-168` swallows all insert errors. Phase A converts FK failures into a warning log, not a silent drop. Expect a short burst of log noise on the first run until the paired-id map warms up.
- **`pagerank_score` availability (H2).** If `graphController` doesn't expose it yet, Wave 19's spec implies it should. Phase D must either add the method or document the gap and ship with null. Flag for Wave 30 review if null.
- **`orchestration_traces` row volume (C5).** A 5-minute Claude session can produce thousands of stdout chunks. 1 SQLite insert per chunk will dominate PTY throughput. Phase I must batch or sample; if in doubt, sample to 1 in N. Measure before shipping.
- **Retention purge running on startup (M2).** A large backlog of old JSONL files purged synchronously at startup could delay the Electron main window. Run purge in a `setImmediate` after window creation.
- **Migration story for in-flight JSONL files.** Old files without `traceId`/`fileId` remain on disk. `tools/train-context.py` filters by `schemaVersion === 2`. Old files are ignored, not deleted (user retention window handles cleanup eventually).
- **Paired-id memory leak (C1).** The pair map entries are evicted at 10-minute TTL, but if the Claude Code process dies between `pre_tool_use` and `post_tool_use`, entries linger until TTL. Acceptable — map size bound by sessions-per-10-min × tools-per-session.
- **Correction detector false positives (H4).** Regex-based detection will misfire on quoted code, casual speech. Acceptable for Wave 29.5 because the detector only adds libraries to a session's enhanced-research set; the downstream research pipeline still makes the fire/no-fire decision. A richer classifier is a later wave.
- **Schema v2 breaking change.** This wave increments the JSONL record schema version from (implicit 1) to 2. Any external tooling reading these files breaks. Only consumer today is the Wave 31 training script (unwritten), so low impact. Document in `roadmap.md` so Wave 30/31 land on v2.

---

## Acceptance

- `sqlite3 telemetry.db "SELECT COUNT(*) FROM outcomes"` returns > 0 after a dogfood session. (C1 confirmed fixed.)
- Every row in `outcomes` has a valid `event_id` foreign key resolving to a row in `events`. (C1 schema integrity.)
- Every row in `context-outcomes-*.jsonl` has a non-null `traceId` and `fileId`. (C3 confirmed.)
- `context-outcomes-*.jsonl` and `context-decisions-*.jsonl` join cleanly on `(traceId, fileId)` with > 90 % of decisions having a matching outcome within the session. (Wave 31 join precondition.)
- `sqlite3 telemetry.db "SELECT COUNT(*) FROM research_invocations WHERE hit_cache IS NOT NULL"` returns > 0. (C4 confirmed.)
- `traceId` is minted for every packet build regardless of router state. (H1 confirmed via grep: no `routerConfig.enabled` branch on the trace path.)
- At least 50 % of `ContextDecisionRecord.features.pagerank_score` values are non-null in a dogfood run on this repo. (H2 confirmed.)
- `ResearchOutcomeRecord` entries contain `toolKind` and `outcomeSignal`; at least one session produces a `reverted` signal for a verified rollback. (H3 confirmed.)
- JSONL filenames follow the `*-YYYY-MM-DD.jsonl` pattern; files older than 30 days are purged at startup. (M2 confirmed.)
- User message containing a known correction pattern ("that's deprecated in Zod 4") appends a row to `corrections-*.jsonl` with `library: zod`. (H4 confirmed.)
- `recordTrace` is called from `claudeCodeAdapter.ts` on spawn and at least some stdout chunks; `orchestration_traces` table is non-empty after a dogfood session. (C5 confirmed.)
- Pre-commit lint hook passes with 0 errors; full-project `eslint src/ --quiet` passes; `npm test` green; `npm run build` green.
- Running `tools/train-context.py --dry-run` (stub from Wave 31 spec or written in this wave) on the captured JSONL produces a non-empty feature matrix and prints the feature-vector schema.

---

## Notes for Wave 30 / Wave 31 readers

- After this wave, Wave 30's "weekly dashboard reflects ≥ 4 weeks of data" is achievable from T+28 days. Research exit criteria should be reviewed against the new `research_invocations` columns.
- Wave 31's `tools/train-context.py` join is `(traceId, fileId)` on JSONL files with `schemaVersion: 2`. The feature vector includes `pagerank_score` (may be null for files outside the graph). Outcome labels are `used | unused | missed` with `toolKind` as a secondary feature.
- Self-correction capture (H4) is deliberately minimal in this wave — it unblocks Wave 30's acceptance criterion but does not implement the full "global staleness feedback" loop. That's Wave 30 scope proper.
- Do not start Wave 30 or Wave 31 until the acceptance section above is green. The audit at `roadmap/data-foundation-audit.md` is the source of truth for why.
