/**
 * telemetryStore.ts — Batched-write SQLite store for structured telemetry.
 *
 * Opens `{userDataDir}/telemetry/telemetry.db`, applies WAL pragmas and DDL,
 * then flushes buffered writes every 100 ms in a single transaction.
 *
 * Feature flag (`telemetry.structured`) is added to the config schema in
 * Phase B; this Phase A module assumes enabled. Phase B wires `isFlagEnabled()`
 * against the real config.
 *
 * Query helpers live in telemetryStoreQueries.ts (split to stay under 300 lines).
 */

import crypto from 'node:crypto';
import path from 'node:path';

import type { Database as DatabaseType } from 'better-sqlite3';

import { getConfigValue } from '../config';
import type { HookPayload } from '../hooks';
import log from '../logger';
import { openDatabase } from '../storage/database';
import {
  type InvocationRow,
  migrateSchemaVersion,
  type OutcomeRow,
  purgeRetainedRows,
  redactPayload,
  TELEMETRY_SCHEMA_SQL,
  type TelemetryEvent,
  type TraceRow,
} from './telemetryStoreHelpers';
import {
  queryEvents,
  type QueryEventsOpts,
  queryInvocations,
  type QueryInvocationsFilter,
  queryOutcomes,
  queryTraces,
} from './telemetryStoreQueries';
import { drainTraceBatcher, initTraceBatcher } from './traceBatcher';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { QueryEventsOpts, QueryInvocationsFilter };

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

export interface RecordInvocationOpts {
  correlationId: string;
  sessionId: string;
  topic: string;
  triggerReason: 'slash-command' | 'hook' | 'explicit' | 'auto' | 'other';
  hitCache: boolean;
  latencyMs: number;
  artifactHash: string | null;
  timestamp?: number;
}

export interface TelemetryStore {
  /** Records a hook event and returns the generated row id. Callers that don't need it may ignore it. */
  record(payload: HookPayload): string;
  recordOutcome(opts: RecordOutcomeOpts): void;
  recordTrace(opts: RecordTraceOpts): void;
  recordInvocation(opts: RecordInvocationOpts): void;
  queryEvents(opts?: QueryEventsOpts): TelemetryEvent[];
  queryOutcomes(eventId: string): OutcomeRow[];
  queryTraces(sessionId: string, limit?: number): TraceRow[];
  queryInvocations(filter?: QueryInvocationsFilter): InvocationRow[];
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

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface StoreState {
  db: DatabaseType;
  queue: PendingEvent[];
  intervalHandle: ReturnType<typeof setInterval>;
  purgeHandle: ReturnType<typeof setInterval>;
}

let singleton: TelemetryStore | null = null;
let flagEnabledOverride: boolean | null = null;

// ─── Flag wiring (Phase B: real config check with override for tests) ─────────

/** Optional config reader injected at startup; absent in test environments. */
let configReader: (() => boolean) | null = null;

/** Called by initTelemetryStore to wire the real config flag. */
export function setConfigReader(reader: () => boolean): void {
  configReader = reader;
}

export function setFlagEnabledOverride(enabled: boolean | null): void {
  flagEnabledOverride = enabled;
}

function isFlagEnabled(): boolean {
  if (flagEnabledOverride !== null) return flagEnabledOverride;
  return configReader?.() ?? false;
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

// ─── Write helpers ────────────────────────────────────────────────────────────

function enqueueEvent(state: StoreState, payload: HookPayload): string {
  const id = crypto.randomUUID();
  if (!isFlagEnabled()) return id;
  const correlationId = payload.correlationId ?? crypto.randomUUID();
  state.queue.push({
    id,
    type: payload.type,
    sessionId: payload.sessionId,
    correlationId,
    timestamp: payload.timestamp,
    payload: JSON.stringify(redactPayload(payload)),
  });
  return id;
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
    log.warn('[telemetry] outcome insert failed', err);
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

function writeInvocation(state: StoreState, opts: RecordInvocationOpts): void {
  if (!isFlagEnabled()) return;
  try {
    state.db.prepare(
      `INSERT INTO research_invocations
        (id, correlation_id, session_id, topic, trigger_reason, artifact_hash, hit_cache, latency_ms, timestamp)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      crypto.randomUUID(),
      opts.correlationId,
      opts.sessionId,
      opts.topic,
      opts.triggerReason,
      opts.artifactHash ?? null,
      opts.hitCache ? 1 : 0,
      opts.latencyMs,
      opts.timestamp ?? Date.now(),
    );
  } catch (err) {
    log.warn('[telemetry] invocation insert failed', err);
  }
}

function schedulePurge(state: StoreState): void {
  const runPurge = (): void => {
    try {
      const deleted = purgeRetainedRows(state.db, RETENTION_MS);
      if (deleted > 0) log.info(`[telemetry] retention purge removed ${deleted} rows`);
    } catch (err) {
      log.warn('[telemetry] retention purge error', err);
    }
  };
  // Run once at startup without blocking
  setImmediate(runPurge);
  // Schedule daily thereafter
  state.purgeHandle = setInterval(runPurge, PURGE_INTERVAL_MS);
  if (typeof state.purgeHandle === 'object' && state.purgeHandle !== null && 'unref' in state.purgeHandle) {
    (state.purgeHandle as NodeJS.Timeout).unref();
  }
}

function closeStore(state: StoreState): void {
  clearInterval(state.intervalHandle);
  clearInterval(state.purgeHandle);
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
  migrateSchemaVersion(db);
  const state: StoreState = {
    db, queue: [],
    intervalHandle: setInterval(() => undefined, 1 << 30),
    purgeHandle: setInterval(() => undefined, 1 << 30),
  };
  clearInterval(state.intervalHandle);
  clearInterval(state.purgeHandle);
  startFlushInterval(state);
  schedulePurge(state);
  return {
    record: (payload) => enqueueEvent(state, payload),
    recordOutcome: (opts) => writeOutcome(state, opts),
    recordTrace: (opts) => writeTrace(state, opts),
    recordInvocation: (opts) => writeInvocation(state, opts),
    queryEvents: (opts = {}) => queryEvents(state.db, opts),
    queryOutcomes: (eventId) => queryOutcomes(state.db, eventId),
    queryTraces: (sessionId, limit = 100) => queryTraces(state.db, sessionId, limit),
    queryInvocations: (filter = {}) => queryInvocations(state.db, filter),
    close: () => closeStore(state),
  };
}

// ─── Singleton API ────────────────────────────────────────────────────────────

export function initTelemetryStore(userDataDir: string): void {
  if (singleton) return;
  try {
    setConfigReader(() => getConfigValue('telemetry')?.structured ?? false);
  } catch {
    // Config not available (e.g. test environment) — flag stays off
  }
  singleton = openTelemetryStore(userDataDir);
  initTraceBatcher();
  log.info('[telemetry] store initialised');
}

export function getTelemetryStore(): TelemetryStore | null {
  return singleton;
}

export function closeTelemetryStore(): void {
  if (!singleton) return;
  drainTraceBatcher();
  singleton.close();
  singleton = null;
  log.info('[telemetry] store closed');
}
