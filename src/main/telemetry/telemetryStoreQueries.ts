/**
 * telemetryStoreQueries.ts — Read-path helpers for the telemetry SQLite store.
 *
 * Extracted from telemetryStore.ts to keep both files under the 300-line limit.
 * All functions receive the `db` handle directly — no singleton access.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

import {
  type InvocationRow,
  type OutcomeRow,
  rowToInvocation,
  rowToOrchestrationTrace,
  rowToOutcome,
  rowToTelemetryEvent,
  type TelemetryEvent,
  type TraceRow,
} from './telemetryStoreHelpers';

// ─── Query options ────────────────────────────────────────────────────────────

export interface QueryEventsOpts {
  sessionId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface QueryInvocationsFilter {
  sessionId?: string;
  since?: number;
  until?: number;
  limit?: number;
}

// ─── Events ───────────────────────────────────────────────────────────────────

function buildEventsQuery(
  db: DatabaseType,
  opts: { sessionId?: string; type?: string; limit: number; offset: number },
): Record<string, unknown>[] {
  const { sessionId, type, limit, offset } = opts;
  if (sessionId !== undefined && type !== undefined) {
    return db
      .prepare('SELECT * FROM events WHERE session_id = ? AND type = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?')
      .all(sessionId, type, limit, offset) as Record<string, unknown>[];
  }
  if (sessionId !== undefined) {
    return db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?')
      .all(sessionId, limit, offset) as Record<string, unknown>[];
  }
  if (type !== undefined) {
    return db
      .prepare('SELECT * FROM events WHERE type = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?')
      .all(type, limit, offset) as Record<string, unknown>[];
  }
  return db
    .prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Record<string, unknown>[];
}

export function queryEvents(db: DatabaseType, opts: QueryEventsOpts): TelemetryEvent[] {
  const limit = Math.min(opts.limit ?? 100, 1000);
  const offset = opts.offset ?? 0;
  const rows = buildEventsQuery(db, { sessionId: opts.sessionId, type: opts.type, limit, offset });
  return rows.map(rowToTelemetryEvent);
}

// ─── Outcomes ────────────────────────────────────────────────────────────────

export function queryOutcomes(db: DatabaseType, eventId: string): OutcomeRow[] {
  const rows = db
    .prepare('SELECT * FROM outcomes WHERE event_id = ?')
    .all(eventId) as Record<string, unknown>[];
  return rows.map(rowToOutcome);
}

// ─── Traces ──────────────────────────────────────────────────────────────────

export function queryTraces(db: DatabaseType, sessionId: string, limit: number): TraceRow[] {
  const rows = db
    .prepare('SELECT * FROM orchestration_traces WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?')
    .all(sessionId, limit) as Record<string, unknown>[];
  return rows.map(rowToOrchestrationTrace);
}

// ─── Invocations ─────────────────────────────────────────────────────────────

export function queryInvocations(db: DatabaseType, filter: QueryInvocationsFilter = {}): InvocationRow[] {
  const { sessionId, since, until, limit = 500 } = filter;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (sessionId !== undefined) { clauses.push('session_id = ?'); params.push(sessionId); }
  if (since !== undefined) { clauses.push('timestamp >= ?'); params.push(since); }
  if (until !== undefined) { clauses.push('timestamp <= ?'); params.push(until); }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(limit, 2000));
  const rows = db
    .prepare(`SELECT * FROM research_invocations ${where} ORDER BY timestamp DESC LIMIT ?`)
    .all(...params) as Record<string, unknown>[];
  return rows.map(rowToInvocation);
}
