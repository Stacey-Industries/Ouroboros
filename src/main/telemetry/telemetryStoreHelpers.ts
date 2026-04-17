/**
 * telemetryStoreHelpers.ts — DDL constants, row-mappers, and retention purge
 * for the telemetry SQLite store.
 *
 * Consumed by telemetryStore.ts. Kept separate to stay under the 300-line limit.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

// ─── DDL ─────────────────────────────────────────────────────────────────────

export const TELEMETRY_SCHEMA_SQL = `
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
  correlation_id TEXT    NOT NULL DEFAULT '',
  session_id     TEXT    NOT NULL,
  topic          TEXT    NOT NULL DEFAULT '',
  trigger_reason TEXT    NOT NULL DEFAULT '',
  artifact_hash  TEXT,
  hit_cache      INTEGER NOT NULL DEFAULT 0,
  latency_ms     INTEGER NOT NULL DEFAULT 0,
  timestamp      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_research_sess ON research_invocations(session_id);
CREATE INDEX IF NOT EXISTS idx_research_ts   ON research_invocations(timestamp DESC);

-- Note: context_decisions and context_outcomes tables were removed from DDL in Wave 29.5
-- Phase I (C2). Wave 31 trains over JSONL, not SQLite, so these tables are dead weight.
-- Existing databases will retain them as orphaned tables until manually cleaned up.

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', '1');
`;

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface TelemetryEvent {
  id: string;
  type: string;
  sessionId: string;
  correlationId: string;
  timestamp: number;
  payload: unknown;
}

export interface OutcomeRow {
  eventId: string;
  kind: string;
  exitCode: number | null;
  durationMs: number | null;
  stderrHash: string | null;
  signals: unknown;
  confidence: string;
}

export interface TraceRow {
  id: string;
  traceId: string;
  sessionId: string;
  phase: string;
  timestamp: number;
  payload: unknown;
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function rowToTelemetryEvent(row: Record<string, unknown>): TelemetryEvent {
  return {
    id: row.id as string,
    type: row.type as string,
    sessionId: row.session_id as string,
    correlationId: row.correlation_id as string,
    timestamp: row.timestamp as number,
    payload: parseJson(row.payload),
  };
}

export function rowToOutcome(row: Record<string, unknown>): OutcomeRow {
  return {
    eventId: row.event_id as string,
    kind: row.kind as string,
    exitCode: row.exit_code as number | null,
    durationMs: row.duration_ms as number | null,
    stderrHash: row.stderr_hash as string | null,
    signals: parseJson(row.signals),
    confidence: row.confidence as string,
  };
}

export function rowToOrchestrationTrace(row: Record<string, unknown>): TraceRow {
  return {
    id: row.id as string,
    traceId: row.trace_id as string,
    sessionId: row.session_id as string,
    phase: row.phase as string,
    timestamp: row.timestamp as number,
    payload: parseJson(row.payload),
  };
}

// ─── Invocation row type + mapper ────────────────────────────────────────────

export interface InvocationRow {
  id: string;
  correlationId: string;
  sessionId: string;
  topic: string;
  triggerReason: string;
  artifactHash: string | null;
  hitCache: boolean;
  latencyMs: number;
  timestamp: number;
}

export function rowToInvocation(row: Record<string, unknown>): InvocationRow {
  return {
    id: row.id as string,
    correlationId: row.correlation_id as string,
    sessionId: row.session_id as string,
    topic: row.topic as string,
    triggerReason: row.trigger_reason as string,
    artifactHash: (row.artifact_hash as string | null) ?? null,
    hitCache: (row.hit_cache as number) !== 0,
    latencyMs: row.latency_ms as number,
    timestamp: row.timestamp as number,
  };
}

// ─── Retention purge ─────────────────────────────────────────────────────────

/**
 * Deletes rows from `events` (and cascading `outcomes`) older than
 * `retentionDays`. Returns the number of rows deleted.
 */
export function purgeRetainedRows(db: DatabaseType, retentionDays: number): number {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = db
    .prepare('DELETE FROM events WHERE timestamp < ?')
    .run(cutoffMs);
  return result.changes;
}
