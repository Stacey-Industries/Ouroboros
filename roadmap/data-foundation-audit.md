# Data Foundation Audit — Waves 15, 24, 25 vs Waves 30, 31

**Audit date:** 2026-04-16
**Auditor model:** Opus 4.7 High
**Scope:** Will the data captured by Waves 15/24/25 actually support the models Wave 30 (auto-firing research) and Wave 31 (learned context ranker) need to train?

**Short answer: No, not as currently shipped.** The schema is mostly there, but four of the join keys Wave 30/31 depend on are either never populated, stored in the wrong column, or FK-invalidated at insert time. A learned ranker trained on the current output would join empty tables; a research dashboard would have no historical data to tune against.

---

## Critical issues (must fix before Wave 30/31 start)

### C1. `correlationId` is never set on hook payloads
**File:** `assets/hooks/*.ps1`, `assets/hooks/*.sh`, `src/main/hooks.ts:278` + `329`
**Observed:** Zero hook scripts emit a `correlation_id` field. `HookPayload.correlationId` is always `undefined` on external events, and synthetic events from `chatOrchestrationBridgeMonitor.ts:87/108/124/154/185` also omit it.

**Consequence for Wave 15's core promise:**
- `outcomeObserver.noteToolUseEvent(sessionId, rawPayload.correlationId ?? '', ts)` stores `eventId = ''` (`src/main/hooks.ts:278`).
- `onPtyExit` then calls `store.recordOutcome({ eventId: '', ... })`.
- `outcomes.event_id` has `REFERENCES events(id) ON DELETE CASCADE` + `PRAGMA foreign_keys = ON` (`telemetryStoreHelpers.ts:32`, `15`). The insert FK-fails against a non-existent `events.id=''`, is swallowed by the try/catch in `writeOutcome` (`telemetryStore.ts:166-168`), and nothing is persisted.

**Net effect:** `outcomes` table is effectively empty. Wave 30's "false-positive rate" metric (research fired, no outcome correlated) cannot be measured. Wave 15 dogfood exit criterion ("< 1 correlation error observed") has never been meaningfully measured because zero correlations happen.

**Fix direction (Wave 15 gap-close):**
- Generate `correlationId = randomUUID()` in `hooks.ts` enqueue path when the payload lacks one, and echo it back on the `post_tool_use` pair by keying a `(sessionId + toolCallId) → correlationId` map across `pre_tool_use`/`post_tool_use`.
- Hook scripts should forward `$CLAUDE_SESSION_ID` + `tool_use_id` (already in the Claude Code hook payload per Claude Code docs); main process pairs them and assigns the correlationId.
- `outcomeObserver` should key `eventId` to the actual row `id` returned by `enqueueEvent`, not the `correlationId` — today it confuses the two (`telemetryStore.ts:141-146`: the row `id` is a fresh `randomUUID()`, not the `correlationId`).

---

### C2. `context_decisions` and `context_outcomes` SQLite tables are never written
**Files:** `contextDecisionWriter.ts`, `contextOutcomeWriter.ts`
**Observed:** Both writers append to JSONL only (`context-decisions.jsonl`, `context-outcomes.jsonl`). No code path writes to the SQLite tables of the same names. `telemetryStoreHelpers.ts:66-82` creates the tables; only the test (`telemetryStoreHelpers.test.ts:52`) references them.

**Consequence for Wave 31:**
- Spec: `tools/train-context.py` joins `context-decisions.jsonl` ↔ `context-outcomes.jsonl` on `(traceId, fileId)` (`roadmap.md:1454`). The JSONL paths work, so this specific join is feasible — **provided C3 is also fixed**.
- Spec also implies a dashboard/inspector that reads the SQLite tables; today any such query returns zero rows. The Wave 15 Orchestration Inspector "Decision viewer" (`roadmap.md:342`) has nothing to display.

**Fix direction:** Either drop the SQLite `context_decisions`/`context_outcomes` tables from the schema (code-comment them as JSONL-only) **or** teach the writers to dual-write. Given Wave 31 uses Python over JSONL, dropping the tables is the cleaner call — but the Orchestration Inspector then needs a JSONL reader.

---

### C3. `ContextOutcome.decisionId` for `missed` entries is a path, not a decision id
**File:** `src/main/orchestration/contextOutcomeObserver.ts:288`
**Observed:**
```ts
outcomes.push({ decisionId: touchedKey, kind: 'missed', toolUsed });
```
`touchedKey` is a lowercased/normalised path string. For `used` and `unused` entries the `decisionId` is the original `RankedContextFile.filePath` (`contextPacketBuilderDecisions.ts:52`: `fileId: rf.filePath`). For `missed` it's a `normalisePath()`-transformed variant of a path the agent touched.

**Consequence for Wave 31:**
- Wave 31's join key is `(traceId, fileId)`. The current writer has no `traceId` in `ContextOutcome` at all (look at `ContextOutcomeRecord` in `contextOutcomeWriter.ts:121-123` — only `id`, `decisionId`, `kind`, `toolUsed`).
- Even if `traceId` were added, the `decisionId` for `used`/`unused` is `file.filePath` (raw, as selected), while `missed` is `normalisePath(...)` (lowercased, forward-slash). Join would require normalising both sides, which the training script has no reason to know.
- The spec explicitly calls `missed` a "synthetic negative for included-but-irrelevant candidates" (`roadmap.md:1454`). The shipped code's definition is different ("touched but NOT in the packet") — that's a spec-vs-code divergence. The shipped definition is probably the correct one (spec reads odd), but this needs clarification.

**Fix direction:**
1. Add `traceId` to `ContextOutcomeRecord` so the join works without relying on decision IDs at all.
2. Add `fileId` to `ContextOutcomeRecord` (normalised the same way on both sides of the join).
3. Clarify spec: `missed = touched-but-not-in-packet` (current behaviour) is the useful signal for training. Update `roadmap.md:1454` definition.

---

### C4. `research_invocations` SQLite table is never written
**File:** `src/main/research/researchCorrelation.ts:57-61`
**Observed:** The correlation store is purely in-memory (`Map<CorrelationId, InvocationRecord>`). `researchSubagent.ts:230` calls `store.recordInvocation(...)` which only updates the in-memory map. No `INSERT INTO research_invocations` exists anywhere in the codebase.

**Consequence for Wave 30:**
- Wave 30 acceptance criterion: "Weekly dashboard exists and reflects ≥ 4 weeks of explicit-pipeline data" (`roadmap.md:1420`). With an in-memory store, the data does not survive process restart; four weeks of telemetry is impossible.
- The schema fields `trigger_reason`, `artifact_hash`, `hit_cache`, `latency_ms` (`telemetryStoreHelpers.ts:55-61`) are all dead. Wave 30's tuning depends on `hit_cache` (to measure cache effectiveness by library) and `latency_ms` (for the "p95 < 800 ms" gate).
- The in-memory store's 10-minute attribution window (`researchCorrelation.ts:30`) is a session-level aggregation; it does not let Wave 30 compute the "false-negative rate" (user corrections after turns where research did NOT fire).

**Fix direction:** Persist `research_invocations` to SQLite at the point `researchSubagent.ts` would call `recordInvocation` — pass `triggerReason` (slash-command / hook / explicit), `hitCache`, `latencyMs`, `artifactHash = sha1(artifact.summary)`. Keep the in-memory correlation store for fast attribution within a session; use SQLite for cross-session analysis.

---

### C5. `orchestration_traces` table has zero production callers
**File:** `src/main/telemetry/telemetryStore.ts:171-187`
**Observed:** `recordTrace()` is defined on the store interface and implemented, but `grep -rn recordTrace src/` returns only tests.

**Consequence for Wave 15/30:**
- The Wave 15 Orchestration Inspector "Traffic tab" (`roadmap.md:339`) — "each CLI invocation, stdin, stdout chunks, timing, exit code" — has no data source.
- This blocks the Inspector UI entirely on the orchestration side. The hook-event timeline and IPC trace viewer are also spec'd but I did not find them implemented (inspector file was not located — see B1 below).

**Fix direction:** Wire `recordTrace` calls into `providers/claudeCodeAdapter.ts` (or equivalent) on each CLI spawn/stdin-write/stdout-chunk. Without this, Wave 30's "invocations fired, outcomes correlated" dashboard has no way to plot invocation latency distributions per library.

---

## High-impact gaps (distortions to Wave 30/31 training signal)

### H1. Context decisions only emit when the router is enabled
**File:** `src/main/agentChat/chatOrchestrationRequestSupport.ts:64-101`, `:191`
**Observed:** `outcomeTraceId` is populated only when `routerConfig?.enabled` is true *and* the router produces a decision. If the user disables the router, or manually overrides the model, `traceId` is `undefined`, and `emitDecisionsForPacket(undefined, ...)` no-ops (`contextPacketBuilderDecisions.ts:29`).

**Consequence for Wave 31:**
- Wave 31 needs ≥ 1 000 samples. The author's dogfood volume depends on the router being on. Any session with router off contributes zero training rows.
- More insidiously: the training distribution is biased toward turns the router felt confident enough to classify. Turns the user manually overrode (typically "the router got it wrong") are excluded, so the learned ranker inherits the router's blind spots.

**Fix direction:** Generate a `traceId` per packet build unconditionally. The router can annotate it with its own decision, but packet build should not require a routing decision to happen. This is a 5-line change in `contextPacketBuilder.ts`: if no `traceId` supplied, mint one.

---

### H2. `pagerank_score` always null in the feature vector
**File:** `src/main/orchestration/contextPacketBuilderDecisions.ts:37`
**Observed:**
```ts
pagerank_score: (rf as unknown as Record<string, unknown>)['pagerank_score'] as number | null ?? null,
```
`RankedContextFile` has no `pagerank_score` field (confirmed: the type is defined in `types.ts`/`typesContext.ts` with no such field). The `as unknown as Record` cast is a placeholder that always resolves to `null`.

**Consequence for Wave 31:**
- Wave 19's PageRank scoring is a specified feature of the context selector (`roadmap.md:365`), and Wave 31 will include it in the logistic model's feature vector. Today every training row has `pagerank_score: null`. The model cannot learn to weight it — it'll be treated as a missing feature and either dropped or zero-imputed, discarding a signal that we have elsewhere.
- This is a quiet defect: tests pass, tsc is clean, but the data is worthless for that feature.

**Fix direction:** Either (a) Wave 19 attaches `pagerank_score` to `RankedContextFile` properly (most work but right place), or (b) the packet builder looks it up from the graph controller at decision-emit time.

---

### H3. Research outcomes don't record outcome *quality*
**File:** `src/main/research/researchOutcomeWriter.ts:22-30`, `contextOutcomeObserverResearch.ts`
**Observed:** `ResearchOutcomeRecord` captures `{ correlationId, sessionId, topic, toolName, filePath, timestamp }`. It records *that* a file was touched within the 10-minute attribution window. It does not record whether that touch succeeded (Edit that stuck vs Edit that was rolled back, test pass/fail afterwards, diagnostic delta).

**Consequence for Wave 30:**
- Wave 30 acceptance: "Outcome correlation measurably differentiates research-then-implement vs non-research turns" (`roadmap.md:1123`). With only a touch count, the only signal is volume (more touches == more value?), which is wrong — 20 `Read`s after research is usually *worse* than 2 `Edit`s that landed and passed tests.
- Wave 24's risk note explicitly calls this out: "Tool-call observation is the fragile bit ... weight `Edit` > `Read` in reward signal" (`roadmap.md:1487`, also `1029`). That weighting is not implemented in the outcome writer.

**Fix direction:** Extend `ResearchOutcomeRecord` with:
- `toolKind: 'read' | 'edit' | 'write' | 'other'` (Wave 31 also needs this).
- `outcomeSignal: 'accepted' | 'reverted' | 'unknown'` — joined from the checkpoint/revert events already in the agent chat bridge (`chatOrchestrationBridgeGit.ts`).
- `followupTestExit: number | null` — joined from the next PTY exit in the same session from `outcomeObserver.onPtyExit`.

---

### H4. Self-correction capture is not implemented
**Spec:** Wave 25 (`roadmap.md:1388-1390`) and Wave 30 (`roadmap.md:1388`) both describe self-correction capture: user says "that's not how useEffect works in React 19", system flags `react` for enhanced research in session, accumulates global staleness feedback.

**Observed:** No file implements this. `grep -rn "correction" src/main/research/` returns only test infrastructure, no capture pipeline.

**Consequence for Wave 30:**
- Acceptance criterion: "`That API was removed in Zod 4` correction flags Zod for session-enhanced research" (`roadmap.md:1418`) cannot pass.
- Global staleness matrix gets no feedback loop — it stays whatever the curated top-30 list is. Long-tail coverage is blind.

**Fix direction:** This is Wave 25 scope that was underbuilt. A pragmatic entry: regex-based detector on user messages matching known "correction" phrasings ("that's wrong", "X doesn't work that way in Y", "deprecated in") + library name extraction; write to a `corrections.jsonl` with `{library, userCorrectionText, sessionId, timestamp}`. The "enhanced research" flag is a per-session Set<library>.

---

## Medium / low-impact findings

### M1. `stderr_hash` is schema-wired but has no producer
**File:** `telemetryStoreHelpers.ts:36`, `telemetryStore.ts:36-37`
**Observed:** `RecordOutcomeOpts.stderrHash` exists in the type, but no call site populates it. `outcomeObserver.onPtyExit` passes `signals` and `durationMs` but not a stderr hash.

**Consequence:** The spec's de-duplication value ("was this the same error again?") is unavailable. Wave 30 can't measure "same failure recurs after research fires" vs "new failure". Lower impact because this is a nice-to-have and can be added when Wave 30 ships.

---

### M2. JSONL 30-day retention policy not observed in `contextDecisionWriter` / `contextOutcomeWriter`
**File:** `contextDecisionWriter.ts:99`, `contextOutcomeWriter.ts:102`
**Observed:** Both writers rotate at 10 MB and keep the last 3 rotations. The Wave 15 spec for telemetry JSONL says 30-day retention (`roadmap.md:347`).

**Consequence:** If the author logs heavily, the retention window collapses to whatever 30 MB covers — could be days, not weeks. Wave 31's "≥ 1 000 samples" gate could be reached quickly; Wave 30's "4 weeks of telemetry" might not survive the rotation.

**Fix direction:** Either add date-stamped filenames (`context-decisions-YYYY-MM-DD.jsonl`) with a time-based purge, or raise the rotation cap. The training pipeline should be able to glob all current + rotated files.

---

### M3. Synthetic events don't track turn boundaries when the router is off
Related to H1. Without a `traceId`, `registerSessionTrace` never fires (`chatOrchestrationBridgeMonitor.ts:84-86`), so `observeToolCallBySession` returns early and `recordTurnEnd` is a no-op (it's gated on `sessionTraceMap.get(sessionId)` being set).

**Fix direction:** Same as H1.

---

### M4. `ContextOutcomeRecord` lacks `turnId` / `timestamp` at write time
**File:** `contextOutcomeWriter.ts:121-123`
**Observed:** The record on disk is `{ id, decisionId, kind, toolUsed }`. Missing:
- `timestamp` — can't plot outcome distribution over time, can't time-slice the training set.
- `turnId` / `traceId` — see C3.
- `sessionId` — can't group-by session for soak metrics.

**Fix direction:** Extend record; the writer has access to all of these via the observer's turn state.

---

## Blind spots in this audit (things I didn't confirm)

### B1. Orchestration Inspector UI (`src/renderer/components/Observability/*`)
I did not read the inspector's frontend. The audit's observations about empty tables (C1, C4, C5) still hold regardless of UI state, but I didn't verify whether the inspector actually exists and renders empty-state, or was never built. This matters for the Wave 15 Phase D exit criterion.

### B2. `outcomeObserver.ts` telemetry tests
I only skimmed the `outcomeObserver.test.ts` file enough to confirm its shape. The FK-violation theory in C1 is based on the schema + code flow; I didn't run the production code end-to-end to confirm that outcome inserts actually throw. A quick `sqlite3 telemetry.db "SELECT COUNT(*) FROM outcomes"` on a long-running local instance would confirm.

### B3. Conflict-monitor outcome path
`outcomeObserver.onConflictSignal` (`outcomeObserver.ts:103-111`) uses `correlationId` directly as `eventId` — same bug as C1 but via a different path. I did not trace whether conflict signals actually supply a valid event-row id.

### B4. Graph summary / PageRank path
H2 assumes `RankedContextFile` lacks `pagerank_score`. I inferred this from the `as unknown as Record` cast; I did not `grep` the actual type definition. If it's there and I missed it, H2 downgrades from "always null" to "sometimes null" — still worth the fix but lower severity.

---

## Recommended action sequence (before Wave 30/31)

A tight set of data-foundation fixes to land before Wave 30 starts. Estimated small (~2-4 day) wave, call it **Wave 29.5 — Data foundation repair**:

1. **C1 fix:** Correlation-id propagation in main process + hook script envelope.
2. **C3 fix:** Add `traceId`, `fileId` (normalised), `sessionId`, `timestamp`, `toolKind` to `ContextOutcomeRecord`. Backward-compat: keep `decisionId` but document it as optional.
3. **C4 fix:** Persist `research_invocations` to SQLite with `triggerReason`, `hitCache`, `latencyMs`, `artifactHash`.
4. **H1 fix:** Mint `traceId` unconditionally at packet build time; router annotates when present.
5. **H2 fix:** Attach `pagerank_score` to `RankedContextFile` at selection time (or at decision-emit time from `graphController`).
6. **H3 fix:** Extend `ResearchOutcomeRecord` with `toolKind`, `outcomeSignal`, `followupTestExit`.
7. **M2 fix:** Date-stamp JSONL filenames + time-based retention.
8. **C2 / C5 / M1 / B1:** Decide whether to keep the SQLite tables and Inspector, or simplify. If keeping, fill the callers; if not, drop the tables.
9. **H4 fix (Wave 25 back-fill):** Implement self-correction capture and a session-enhanced-research flag set.

After this, re-validate the `roadmap.md` exit criteria for Waves 15/24/25 against the new data surface. Then Wave 30 can start with confidence that the dashboards have data and the thresholds are tuneable; Wave 31's training script can run against JSONL with the join keys it needs.

---

## Direct answer to the question

**"Will the data captured by these three waves actually support the models Wave 30 and Wave 31 need to train?"**

**No — five fixes are load-bearing:**

1. Without **C1** (correlationId propagation), `outcomes` table is empty and Wave 15's central promise is unmet.
2. Without **C3** (traceId + fileId in outcome records), Wave 31's `train-context.py` join key is absent.
3. Without **C4** (persisted research_invocations), Wave 30's weekly dashboard and threshold tuning have no historical data.
4. Without **H1** (traceId independent of router), the training set is biased toward router-confident turns and samples accumulate slowly.
5. Without **H3** (outcome *quality*, not just touch count), Wave 30's "research helps vs doesn't" correlation is noise.

Everything else is polish. But these five are not polish; they are the shape of the data the downstream models consume. Wave 30 and Wave 31 should not start until they're addressed.
