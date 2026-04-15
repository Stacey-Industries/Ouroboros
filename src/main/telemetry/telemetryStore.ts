/**
 * telemetryStore.ts — Batched-write SQLite store for structured telemetry.
 *
 * Opens `{userDataDir}/telemetry/telemetry.db`, applies WAL pragmas and DDL,
 * then flushes buffered writes every 100 ms in a single transaction.
 *
 * Feature flag (`telemetry.structured`) is added to the config schema in
 * Phase B; this Phase A module assumes enabled. Phase B wires `isFlagEnabled()`
 * against the real config.
 */

import crypto from 'node:crypto';
import path from 'node:path';

import type { Database as DatabaseType } from 'better-sqlite3';

import type { HookPayload } from '../hooks';
import log from '../logger';
import { openDatabase } from '../storage/database';
import {
  type OutcomeRow,
  rowToOrchestrationTrace,
  rowToOutcome,
  rowToTelemetryEvent,
  TELEMETRY_SCHEMA_SQL,
  type TelemetryEvent,
  type TraceRow,
} from './telemetryStoreHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordOutcomeOpts {
  eventId: string;
  kind: string;
  exitCode?: number | null;
  durationMs?: number | null;
  stderrHash?: string | null;
  signals?: unknown[];
  confidence?: 'high' | 'medium' | 'low';
}

export interface RecordTraceOpts {
  id: string;
  traceId: string;
  sessionId: string;
  phase: string;
  timestamp?: number;
  payload?: unknown;
}

export interface QueryEventsOpts {
  sessionId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface TelemetryStore {
  record(payload: HookPayload): void;
  recordOutcome(opts: RecordOutcomeOpts): void;
  recordTrace(opts: RecordTraceOpts): void;
  queryEvents(opts?: QueryEventsOpts): TelemetryEvent[];
  queryOutcomes(eventId: string): OutcomeRow[];
  queryTraces(sessionId: string, limit?: number): TraceRow[];
  close(): void;
}

interface PendingEvent {
  id: string;
  type: string;
  sessionId: string;
  correlationId: string;
  timestamp: number;
  payload: string;
}

interface StoreState {
  db: DatabaseType;
  queue: PendingEvent[];
  intervalHandle: ReturnType<typeof setInterval>;
}

let singleton: TelemetryStore | null = null;
let flagEnabledOverride: boolean | null = null;

// ─── Flag wiring (Phase A stub; Phase B replaces with real config check) ──────

export function setFlagEnabledOverride(enabled: boolean | null): void {
  flagEnabledOverride = enabled;
}

function isFlagEnabled(): boolean {
  return flagEnabledOverride ?? true;
}

// ─── Internal flush ───────────────────────────────────────────────────────────

function flushEvents(db: DatabaseType, queue: PendingEvent[]): void {
  if (queue.length === 0) return;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO events (id, type, session_id, correlation_id, timestamp, payload) VALUES (?,?,?,?,?,?)',
  );
  const flush = db.transaction((rows: PendingEvent[]) => {
    for (const r of rows) {
      insert.run(r.id, r.type, r.sessionId, r.correlationId, r.timestamp, r.payload);
    }
  });
  flush(queue);
}

function startFlushInterval(state: StoreState): void {
  state.intervalHandle = setInterval(() => {
    if (state.queue.length === 0) return;
    const batch = state.queue.splice(0, state.queue.length);
    try {
      flushEvents(state.db, batch);
    } catch (err) {
      log.error('[telemetry] flush error', err);
    }
  }, 100);
  if (typeof state.intervalHandle === 'object' && state.intervalHandle !== null && 'unref' in state.intervalHandle) {
    (state.intervalHandle as NodeJS.Timeout).unref();
  }
}

// ─── Record helpers ───────────────────────────────────────────────────────────

function enqueueEvent(state: StoreState, payload: HookPayload): void {
  if (!isFlagEnabled()) return;
  const correlationId =
    (payload as HookPayload & { correlationId?: string }).correlationId ??
    crypto.randomUUID();
  state.queue.push({
    id: crypto.randomUUID(),
    type: payload.type,
    sessionId: payload.sessionId,
    correlationId,
    timestamp: payload.timestamp,
    payload: JSON.stringify(payload),
  });
}

function writeOutcome(state: StoreState, opts: RecordOutcomeOpts): void {
  if (!isFlagEnabled()) return;
  try {
    state.db.prepare(
      'INSERT OR REPLACE INTO outcomes (event_id, kind, exit_code, duration_ms, stderr_hash, signals, confidence) VALUES (?,?,?,?,?,?,?)',
    ).run(
      opts.eventId,
      opts.kind,
      opts.exitCode ?? null,
      opts.durationMs ?? null,
      opts.stderrHash ?? null,
      JSON.stringify(opts.signals ?? []),
      opts.confidence ?? 'low',
    );
  } catch (err) {
    log.error('[telemetry] recordOutcome error', err);
  }
}

function writeTrace(state: StoreState, opts: RecordTraceOpts): void {
  if (!isFlagEnabled()) return;
  try {
    state.db.prepare(
      'INSERT OR IGNORE INTO orchestration_traces (id, trace_id, session_id, phase, timestamp, payload) VALUES (?,?,?,?,?,?)',
    ).run(
      opts.id,
      opts.traceId,
      opts.sessionId,
      opts.phase,
      opts.timestamp ?? Date.now(),
      JSON.stringify(opts.payload ?? {}),
    );
  } catch (err) {
    log.error('[telemetry] recordTrace error', err);
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

function buildQueryEvents(
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

function runQueryEvents(state: StoreState, opts: QueryEventsOpts): TelemetryEvent[] {
  const limit = Math.min(opts.limit ?? 100, 1000);
  const offset = opts.offset ?? 0;
  const rows = buildQueryEvents(state.db, { sessionId: opts.sessionId, type: opts.type, limit, offset });
  return rows.map(rowToTelemetryEvent);
}

function runQueryOutcomes(state: StoreState, eventId: string): OutcomeRow[] {
  const rows = state.db
    .prepare('SELECT * FROM outcomes WHERE event_id = ?')
    .all(eventId) as Record<string, unknown>[];
  return rows.map(rowToOutcome);
}

function runQueryTraces(state: StoreState, sessionId: string, limit: number): TraceRow[] {
  const rows = state.db
    .prepare('SELECT * FROM orchestration_traces WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?')
    .all(sessionId, limit) as Record<string, unknown>[];
  return rows.map(rowToOrchestrationTrace);
}

function closeStore(state: StoreState): void {
  clearInterval(state.intervalHandle);
  if (state.queue.length > 0) {
    const batch = state.queue.splice(0, state.queue.length);
    try {
      flushEvents(state.db, batch);
    } catch (err) {
      log.error('[telemetry] close flush error', err);
    }
  }
  try {
    state.db.close();
  } catch {
    // Already closed
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function openTelemetryStore(userDataDir: string): TelemetryStore {
  const dbPath = path.join(userDataDir, 'telemetry', 'telemetry.db');
  const db = openDatabase(dbPath);
  db.exec(TELEMETRY_SCHEMA_SQL);
  const state: StoreState = { db, queue: [], intervalHandle: setInterval(() => undefined, 1 << 30) };
  clearInterval(state.intervalHandle);
  startFlushInterval(state);
  return {
    record: (payload) => enqueueEvent(state, payload),
    recordOutcome: (opts) => writeOutcome(state, opts),
    recordTrace: (opts) => writeTrace(state, opts),
    queryEvents: (opts = {}) => runQueryEvents(state, opts),
    queryOutcomes: (eventId) => runQueryOutcomes(state, eventId),
    queryTraces: (sessionId, limit = 100) => runQueryTraces(state, sessionId, limit),
    close: () => closeStore(state),
  };
}

// ─── Singleton API ────────────────────────────────────────────────────────────

export function initTelemetryStore(userDataDir: string): void {
  if (singleton) return;
  singleton = openTelemetryStore(userDataDir);
  log.info('[telemetry] store initialised');
}

export function getTelemetryStore(): TelemetryStore | null {
  return singleton;
}

export function closeTelemetryStore(): void {
  if (!singleton) return;
  singleton.close();
  singleton = null;
  log.info('[telemetry] store closed');
}
