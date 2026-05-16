# Wave 15 — Instrumentation & Observability Foundation
## Implementation Plan

**Version target:** v1.3.17
**Feature flag:** `telemetry.structured` — default `true` in dev (`!app.isPackaged`); default `false` in production for the first release cycle; toggle in Settings › Developer
**Upstream dependencies:** None (first wave in Arc A)
**Unblocks:** Wave 16 (session attribution), Wave 18 (orchestration tracing), Wave 24 (context decisions), Wave 25 (research invocations)

---

## 1. Architecture Overview

### Module Surface Diagram

```
src/main/telemetry/
  ├── telemetryStore.ts        ← SQLite CRUD, batched-write queue (100ms), WAL
  ├── telemetryStore.test.ts
  ├── telemetryStoreHelpers.ts ← DDL constants, row-mappers, retention purge
  ├── telemetryStoreHelpers.test.ts
  ├── telemetryJsonlMirror.ts  ← daily-rotated JSONL writer (10 MB cap, 30-day retention)
  ├── telemetryJsonlMirror.test.ts
  ├── outcomeObserver.ts       ← subscribes to PTY exits; correlates to post_tool_use
  ├── outcomeObserver.test.ts
  └── index.ts                 ← barrel re-export

src/main/orchestration/
  └── contextTypes.ts          ← ContextDecision, ContextFeatures, ContextOutcome,
                                  EditProvenance (signatures only; Wave 24 populates content)

src/renderer/components/Observability/   ← NEW MODULE
  ├── OrchestrationInspector.tsx        ← top-level panel, tab router
  ├── InspectorTrafficTab.tsx           ← CLI invocations, stdin/stdout, timing
  ├── InspectorTimelineTab.tsx          ← hook event timeline, correlationId tree
  ├── InspectorDecisionTab.tsx          ← router/context decisions (scaffold)
  ├── InspectorExport.ts                ← HAR-like JSON export action
  └── index.ts

src/main/ipc-handlers/
  └── telemetry.ts             ← ipcMain.handle registrations for telemetry:* and
                                  observability:* channels

src/renderer/types/
  └── electron-telemetry.d.ts  ← TelemetryAPI, ObservabilityAPI IPC surface types
```

### Architecture Paragraphs

**telemetryStore and JSONL mirrors.** `telemetryStore.ts` opens `{app.userData}/telemetry/telemetry.db` using the existing `openDatabase` helper from `src/main/storage/database.ts`. All writes are buffered in a module-level array and flushed in a single SQLite transaction every 100 ms via a `setInterval`. This prevents write amplification during burst tool calls. `telemetryJsonlMirror.ts` is a thin wrapper over `routerLogger.ts`'s rotation pattern — one line per event, daily rotation, 10 MB cap, 30-day retention. Both the SQLite and JSONL writes are gated behind the `telemetry.structured` feature flag check; if the flag is off, `telemetryStore.record()` is a no-op.

**correlationId threading.** `HookPayload` gains an optional `correlationId?: string` field. Every call to `dispatchToRenderer` in `hooks.ts` that enters `sendPayload` now also calls `telemetryStore.record(payload)`. The `correlationId` is generated at the emission side (UUID v4 via Node 20+ `crypto.randomUUID()` — see note in §6 on UUID version). The router's existing `traceId` (returned by `logRoutingDecision` in `chatOrchestrationRequestSupport.ts`) is passed as an optional parameter to `buildContextPacket()`. This connects a routing decision to the context packet built for the same agent turn, using `traceId` as the join key for `orchestration_traces` rows.

**Startup sequencing.** `telemetryStore` initializes inside `initializeApplication()` in `main.ts`, after `runAllMigrations(defaultRoot)` completes and before `createWindow()` is called. The call is `await initTelemetryStore()` wrapped in `runStartupStep`. This guarantees the `telemetry.db` schema exists before any hook events arrive (hooks start after `startBackgroundServices`, which is after `createWindow`). Measured startup impact target: < 50 ms (the DB open + pragma + DDL on an already-existing database takes ~5–15 ms).

**Inspector UI IPC surface.** The renderer queries the inspector data via `telemetry:queryEvents`, `telemetry:queryOutcomes`, `telemetry:queryTraces`, and `observability:exportTrace` IPC channels registered in `src/main/ipc-handlers/telemetry.ts`. The inspector uses virtualized lists (React-window or similar existing dependency) to handle 10K+ event sets. The `InspectorTrafficTab` shows CLI invocations; `InspectorTimelineTab` draws per-correlationId tree lines. The inspector is opened via command palette ("Show Orchestration Inspector") and a status-bar icon using the existing `menu:command-palette` event bus.

**Session-replay scaffold.** Session replay is read-only structured event playback, not re-execution. `InspectorTimelineTab` already renders events in time order. The "replay" mode loads a stored session's events from `telemetry:queryEvents` with a `sessionId` filter, then steps through them at configurable speed using a `setInterval` in the renderer. The existing `src/renderer/components/SessionReplay/` directory hosts the replay component — Wave 15 adds a `TelemetryReplaySource` option to `SessionReplayPanelController.ts` so the inspector can drive replay from `telemetry:queryEvents` results.

---

## 2. SQLite Schema — Full DDL

File: defined as a constant in `src/main/telemetry/telemetryStoreHelpers.ts`

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS events (
  id            TEXT    NOT NULL PRIMARY KEY,
  type          TEXT    NOT NULL,
  session_id    TEXT    NOT NULL,
  correlation_id TEXT   NOT NULL,
  timestamp     INTEGER NOT NULL,
  payload       TEXT    NOT NULL DEFAULT '{}'
) STRICT;

CREATE INDEX IF NOT EXISTS idx_events_session   ON events(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_corr      ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_type_ts   ON events(type, timestamp DESC);

CREATE TABLE IF NOT EXISTS outcomes (
  event_id      TEXT    NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL,
  exit_code     INTEGER,
  duration_ms   INTEGER,
  stderr_hash   TEXT,
  signals       TEXT    NOT NULL DEFAULT '[]',
  confidence    TEXT    NOT NULL DEFAULT 'low',
  PRIMARY KEY (event_id, kind)
) STRICT;

CREATE TABLE IF NOT EXISTS orchestration_traces (
  id            TEXT    NOT NULL PRIMARY KEY,
  trace_id      TEXT    NOT NULL,
  session_id    TEXT    NOT NULL,
  phase         TEXT    NOT NULL,
  timestamp     INTEGER NOT NULL,
  payload       TEXT    NOT NULL DEFAULT '{}'
) STRICT;

CREATE INDEX IF NOT EXISTS idx_orch_trace  ON orchestration_traces(trace_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_orch_sess   ON orchestration_traces(session_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS research_invocations (
  id             TEXT    NOT NULL PRIMARY KEY,
  session_id     TEXT    NOT NULL,
  trigger_reason TEXT    NOT NULL DEFAULT '',
  topics         TEXT    NOT NULL DEFAULT '[]',
  artifact_hash  TEXT,
  hit_cache      INTEGER NOT NULL DEFAULT 0,
  latency_ms     INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS idx_research_sess ON research_invocations(session_id);

CREATE TABLE IF NOT EXISTS context_decisions (
  id          TEXT    NOT NULL PRIMARY KEY,
  trace_id    TEXT    NOT NULL,
  file_id     TEXT    NOT NULL,
  features    TEXT    NOT NULL DEFAULT '{}',
  score       REAL    NOT NULL DEFAULT 0,
  included    INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX IF NOT EXISTS idx_cdec_trace ON context_decisions(trace_id);

CREATE TABLE IF NOT EXISTS context_outcomes (
  decision_id TEXT    NOT NULL REFERENCES context_decisions(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,
  tool_used   TEXT,
  PRIMARY KEY (decision_id, kind)
) STRICT;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', '1');
```

---

## 3. TypeScript Types — `src/main/orchestration/contextTypes.ts`

```typescript
/**
 * contextTypes.ts — Observability types for context selection decisions.
 *
 * Signatures defined in Wave 15. Wave 24 populates content.
 * Wave 18 populates orchestration tracing content.
 */

import type { ContextReasonKind } from '../../shared/types/orchestrationDomain';

export const TELEMETRY_DIR = 'telemetry';
export const OUTCOMES_DIR = '.ouroboros/outcomes';

export interface ContextFeatures {
  score: number;
  reasons: ReadonlyArray<{ kind: ContextReasonKind; weight: number }>;
  pagerank_score: number | null;
  included: boolean;
}

export interface ContextDecision {
  id: string;
  traceId: string;
  fileId: string;
  features: ContextFeatures;
  score: number;
  included: boolean;
}

export type ContextOutcomeKind = 'used' | 'unused' | 'missed';

export interface ContextOutcome {
  decisionId: string;
  kind: ContextOutcomeKind;
  toolUsed?: string;
}

export interface EditProvenance {
  sessionId: string;
  editedAt: string;
  editTool: string;
  correlationId: string;
}
```

---

## 4. Phase Sequencing (Commit Order)

### Phase A — Telemetry DB Schema + Store (Commit 1)
Files created:
- `src/main/telemetry/telemetryStoreHelpers.ts` + `.test.ts`
- `src/main/telemetry/telemetryStore.ts` + `.test.ts`
- `src/main/telemetry/telemetryJsonlMirror.ts` + `.test.ts`
- `src/main/telemetry/index.ts`

Acceptance gate: `tsc --noEmit` clean; `telemetryStore.test.ts` green; DB opens in WAL mode.

### Phase B — correlationId + Startup Wiring (Commit 2)
Files modified:
- `src/main/hooks.ts` (+`correlationId` field + record call)
- `src/main/main.ts` (init + close telemetry store)
- `src/main/orchestration/contextPacketBuilder.ts` (traceId parameter, signature only)
- `src/main/agentChat/chatOrchestrationBridgeSend.ts` (thread traceId)
- `src/main/configSchemaTail.ts` (telemetry flag)

Acceptance gate: launch app in dev mode; verify `telemetry.db` is created in `userData`; verify hook events appear in `events` table; JSONL file `events-YYYY-MM-DD.jsonl` exists.

### Phase C — Outcome Observer (Commit 3)
Files created:
- `src/main/telemetry/outcomeObserver.ts` + `.test.ts`

Files modified:
- `src/main/pty.ts` (onPtyExit hook)

Acceptance gate: run a Claude Code agent session; kill the PTY; verify `outcomes` row appears in DB linked to the correct event.

### Phase D — Inspector UI (Commit 4)
Files created:
- `src/renderer/components/Observability/*` (5 new files + test files)
- `src/renderer/types/electron-telemetry.d.ts`
- `src/main/ipc-handlers/telemetry.ts` + `.test.ts`

Files modified:
- `src/renderer/types/electron-workspace.d.ts`
- `src/renderer/types/electron.d.ts`
- `src/preload/preloadSupplementalApis.ts`
- `src/main/ipc.ts`
- `src/main/ipc-handlers/index.ts`

Acceptance gate: Command palette → "Show Orchestration Inspector" → panel opens with last 100 events for current session; correlationId tree lines drawn; export-as-JSON writes a file.

### Phase E — Session-Replay Scaffold (Commit 5)
Files modified:
- `src/renderer/components/SessionReplay/SessionReplayPanelController.ts`
- `src/renderer/components/SessionReplay/types.ts`

Acceptance gate: Inspector timeline → "Replay" button loads events in sequential playback mode.

### Phase F — Context Types + Remaining Scaffolding (Commit 6)
Files created:
- `src/main/orchestration/contextTypes.ts`

Acceptance gate: `tsc --noEmit` clean; no behavioral changes to context selection.

---

## 5. Module-Level File Specs

### Phase A Files

#### `src/main/telemetry/telemetryStoreHelpers.ts` — **CREATE**
- DDL SQL constant `TELEMETRY_SCHEMA_SQL`
- Row mappers: `rowToTelemetryEvent`, `rowToOutcome`, `rowToOrchestrationTrace`
- `purgeRetainedRows(db, retentionDays)` — deletes events older than N days
- Line budget: ~150 lines
- Test: DDL runs without error; row mapper round-trips; purge deletes correct rows

#### `src/main/telemetry/telemetryStore.ts` — **CREATE**
- `openTelemetryStore(userDataDir)` → returns `TelemetryStore` handle
- `TelemetryStore.record(payload: HookPayload): void` — enqueues for batch flush
- `TelemetryStore.recordOutcome`, `recordTrace`
- `TelemetryStore.queryEvents(opts)` — paginated, server-side filter
- `TelemetryStore.close()`
- Internal: `setInterval(flush, 100)` writes batch in one transaction
- Line budget: ~200 lines
- Test: record→query round-trip, batch flush under 100ms, WAL mode confirmed, pagination, close flushes queue

#### `src/main/telemetry/telemetryJsonlMirror.ts` — **CREATE**
- `createTelemetryJsonlMirror(telemetryDir)` → returns `TelemetryJsonlMirror`
- Follows `routerLogger.ts` pattern: `fs.openSync(path, 'a')`, rotate on 10 MB
- Daily rotation: `events-YYYY-MM-DD.jsonl`
- `purgeOldFiles(dir, retentionDays = 30)`
- Line budget: ~120 lines

#### `src/main/telemetry/index.ts` — **CREATE**
Barrel: ~20 lines

### Phase B Files

#### `src/main/hooks.ts` — **MODIFY** (currently 317 lines)
- Add `correlationId?: string` to `HookPayload`
- In `dispatchToRenderer`, after `shadowRouteHookEvent`, add `getTelemetryStore()?.record(...)` with flag check

#### `src/main/main.ts` — **MODIFY** (already 334 lines, pre-existing debt)
- Add `await runStartupStep('[main] telemetry store init:', initTelemetryStore)` after migrations
- Add `closeTelemetryStore()` in `will-quit` handler
- +3 lines

#### `src/main/orchestration/contextPacketBuilder.ts` — **MODIFY** (already 355 lines, pre-existing debt)
- Add optional `traceId?: string` to options object
- Pass through to internal builder

#### `src/main/agentChat/chatOrchestrationBridgeSend.ts` — **MODIFY** (already 345 lines)
- Thread `traceId` from `preparePendingSend` into `buildContextPacket` options

#### `src/main/configSchemaTail.ts` — **MODIFY**
- Add `telemetry: { structured: boolean, retentionDays: number }` key

### Phase C Files

#### `src/main/telemetry/outcomeObserver.ts` — **CREATE**
- `createOutcomeObserver(store)` → `OutcomeObserver`
- `onPtyExit(sessionId, cwd, exitCode, signal, durationMs)` — correlates to last post_tool_use within 30s
- Confidence: high (<5s), medium (<30s), low
- Bounded `Map<sessionId, recentTs>` with 1000-entry cap
- Line budget: ~180 lines

#### `src/main/pty.ts` — **MODIFY** (already 353 lines)
- Add `sessionStartTs` Map
- Call `getOutcomeObserver()?.onPtyExit(...)` in `handleSessionExit`
- +5 lines

### Phase D Files

#### `src/renderer/components/Observability/OrchestrationInspector.tsx` — **CREATE**
- Top-level panel, 3 tabs (Traffic, Timeline, Decisions)
- Accepts `sessionId?: string`; defaults to active session
- Line budget: ~120 lines

#### `src/renderer/components/Observability/InspectorTrafficTab.tsx` — **CREATE**
- Virtualized list of CLI invocations
- Fields: phase, timestamp, duration_ms, exit_code, stdin/stdout preview
- Line budget: ~140 lines

#### `src/renderer/components/Observability/InspectorTimelineTab.tsx` — **CREATE**
- Groups by `correlationId`; SVG tree lines
- Line budget: ~180 lines

#### `src/renderer/components/Observability/InspectorDecisionTab.tsx` — **CREATE**
- Scaffold placeholder for Wave 24
- Line budget: ~30 lines

#### `src/renderer/components/Observability/InspectorExport.ts` — **CREATE**
- HAR-like JSON export
- Line budget: ~60 lines

#### `src/main/ipc-handlers/telemetry.ts` — **CREATE**
- `registerTelemetryHandlers(store)` + cleanup
- Channels: `telemetry:queryEvents`, `telemetry:queryOutcomes`, `telemetry:queryTraces`, `observability:exportTrace`
- Line budget: ~120 lines

### Phase E Files

#### `src/renderer/components/SessionReplay/SessionReplayPanelController.ts` — **MODIFY**
- Add `telemetrySessionId?: string` option; loads from `telemetry:queryEvents` when set

### Phase F Files

#### `src/main/orchestration/contextTypes.ts` — **CREATE**
See §3 above. ~80 lines, no test file (pure types).

---

## 6. Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| **SQLite write contention** during burst tool calls | WAL mode + 100ms batched-write. Single transaction per flush. `busy_timeout = 5000`. |
| **Disk growth** on active sessions | 10 MB JSONL cap + rotation. 30-day retention. Future Settings UI. |
| **Correlation false positives** in rapid-fire | Per-session scoping. Confidence scoring. Session ID always in correlation key. |
| **Inspector perf on 10K+ events** | Virtualized list. Server-side filter/pagination. Last-100 default. |
| **main.ts / preload already over 300 lines** | Pre-existing debt. Wave 15 adds <5 lines each. Flag for Wave 40. |
| **UUID v7 vs v4** | Decision: v4 is acceptable. `timestamp` column provides ordering. Follow-up ticket if v7 needed for external tools. |
| **contextPacketBuilder.ts already 355 lines** | Only 1-2 lines added. Pre-existing debt. |
| **Flag missing from config schema** | Add to `configSchemaTail.ts`. Default `!app.isPackaged`. |

---

## 7. Testing Strategy

### Unit Tests per Module

| Test File | Key Assertions |
|-----------|----------------|
| `telemetryStore.test.ts` | record→query round-trip, flush under 100ms, WAL confirmed, pagination, close flushes |
| `telemetryStoreHelpers.test.ts` | row mapper round-trips, DDL executes, purge removes correct rows |
| `telemetryJsonlMirror.test.ts` | file created, rotation at 10 MB, old files purged |
| `outcomeObserver.test.ts` | high/medium/low confidence, 30s boundary, no cross-session correlation |
| `ipc-handlers/telemetry.test.ts` | queryEvents pagination, exportTrace file written, unknown session returns [] |

### Integration Tests

1. Hook → Store → Inspector roundtrip
2. PTY exit → outcome correlation
3. JSONL mirror integrity (20 events, each line valid JSON)
4. Flag-off no-op (no DB writes, no JSONL files)

### Soak Criteria

- 1 author-week with `telemetry.structured = true`
- `SELECT COUNT(*) FROM events` proportional to usage
- Correlation hit rate > 80%
- Startup delta ≤ 50 ms
- Inspector 60fps on 10K events
- Zero `SQLITE_BUSY` errors in logs

---

## 8. Rollback Plan

**Flag off:** Set `telemetry.structured = false`. All `record()` calls become no-ops. Inspector shows empty state.

**Persisted data:** `telemetry.db` + JSONL files remain on disk. Not deleted. Can be manually removed.

**Code rollback:** `correlationId` is optional. Removing requires no other changes.

**Schema forward-compat:** Wave 24/25 tables are stubs with `IF NOT EXISTS` — idempotent.

---

## 9. Config Schema Addition

In `src/main/configSchemaTail.ts`:

```typescript
telemetry: {
  type: 'object',
  properties: {
    structured: { type: 'boolean', default: false },
    retentionDays: { type: 'number', default: 30 },
  },
},
```

`main.ts` overrides default:
```typescript
const isStructured = getConfigValue('telemetry')?.structured ?? !app.isPackaged;
```

---

## 10. Cross-Wave Stability Commitments

The following must not be renamed/removed without a migration:

| Artifact | Consumed by |
|----------|-------------|
| `events.correlation_id` | Wave 16 |
| `events.session_id`, `events.type` | Wave 18 |
| `context_decisions.trace_id` | Wave 24 |
| `context_outcomes.decision_id` | Wave 24 |
| `research_invocations.session_id` | Wave 25 |
| `ContextDecision`, `ContextFeatures`, `ContextOutcome`, `EditProvenance` | Wave 24 |
| `buildContextPacket` `traceId` parameter | Wave 24 |
| `HookPayload.correlationId` | Wave 16, 18 |

---

## 11. File Count + Line Estimate

- **New files:** 18 (10 source + 8 test)
- **Modified files:** 12
- **Total touched:** 30
- **Total lines added (net):** ~2,130
