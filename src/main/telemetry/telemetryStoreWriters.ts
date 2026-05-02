/**
 * telemetryStoreWriters.ts — SQLite + JSONL dual-write helpers.
 *
 * Extracted from `telemetryStore.ts` to keep that file under the 300-line
 * cap. Each writer:
 *   1. Checks the `telemetry.structured` flag (caller passes via `isEnabled`).
 *   2. Inserts into the SQLite hot tier (catches errors so the JSONL mirror
 *      still receives the record).
 *   3. Mirrors a normalized record to the JSONL cold tier (fire-and-forget;
 *      `state.jsonlMirror` may be null in tests).
 *
 * Wave 70 follow-up — pre-fix, only `enqueueEvent` (hook events) mirrored to
 * JSONL. Outcomes / traces / invocations went to SQLite only and were lost
 * after the 30-day purge. Now all four telemetry kinds reach the cold tier.
 */

import crypto from 'node:crypto';

import type { Database as DatabaseType } from 'better-sqlite3';

import log from '../logger';
import type { TelemetryJsonlMirror } from './telemetryJsonlMirror';
import type { RecordInvocationOpts, RecordOutcomeOpts, RecordTraceOpts } from './telemetryStore';

export interface MirrorTarget {
  db: DatabaseType;
  jsonlMirror: TelemetryJsonlMirror | null;
}

export type MirrorKind = 'event' | 'outcome' | 'trace' | 'invocation';

export function appendMirror(
  state: MirrorTarget,
  kind: MirrorKind,
  record: Record<string, unknown>,
): void {
  // Spread record FIRST so a stray `kind` property on the record doesn't
  // shadow the discriminator. (Outcome rows have an inner `kind` field —
  // we rename it to `outcomeKind` upstream, but defense in depth here.)
  state.jsonlMirror?.appendEvent({ ...record, kind });
}

function insertOutcomeRow(
  db: DatabaseType,
  opts: RecordOutcomeOpts,
  signals: unknown[],
  confidence: string,
): void {
  try {
    db.prepare(
      'INSERT OR REPLACE INTO outcomes (event_id, kind, exit_code, duration_ms, stderr_hash, signals, confidence) VALUES (?,?,?,?,?,?,?)',
    ).run(
      opts.eventId,
      opts.kind,
      opts.exitCode ?? null,
      opts.durationMs ?? null,
      opts.stderrHash ?? null,
      JSON.stringify(signals),
      confidence,
    );
  } catch (err) {
    log.warn('[telemetry] outcome insert failed', err);
  }
}

export function writeOutcomeWithMirror(state: MirrorTarget, opts: RecordOutcomeOpts): void {
  const signals = opts.signals ?? [];
  const confidence = opts.confidence ?? 'low';
  insertOutcomeRow(state.db, opts, signals, confidence);
  // `outcomeKind` (not `kind`) so the top-level `kind:'outcome'` discriminator
  // applied by `appendMirror` is not shadowed by the spread.
  appendMirror(state, 'outcome', {
    eventId: opts.eventId,
    outcomeKind: opts.kind,
    exitCode: opts.exitCode ?? null,
    durationMs: opts.durationMs ?? null,
    stderrHash: opts.stderrHash ?? null,
    signals,
    confidence,
    ts: Date.now(),
  });
}

export function writeTraceWithMirror(state: MirrorTarget, opts: RecordTraceOpts): void {
  const ts = opts.timestamp ?? Date.now();
  const payload = opts.payload ?? {};
  try {
    state.db
      .prepare(
        'INSERT OR IGNORE INTO orchestration_traces (id, trace_id, session_id, phase, timestamp, payload) VALUES (?,?,?,?,?,?)',
      )
      .run(opts.id, opts.traceId, opts.sessionId, opts.phase, ts, JSON.stringify(payload));
  } catch (err) {
    log.error('[telemetry] recordTrace error', err);
  }
  appendMirror(state, 'trace', {
    id: opts.id,
    traceId: opts.traceId,
    sessionId: opts.sessionId,
    phase: opts.phase,
    timestamp: ts,
    payload,
  });
}

export function writeInvocationWithMirror(state: MirrorTarget, opts: RecordInvocationOpts): void {
  const id = crypto.randomUUID();
  const ts = opts.timestamp ?? Date.now();
  try {
    state.db
      .prepare(
        `INSERT INTO research_invocations
        (id, correlation_id, session_id, topic, trigger_reason, artifact_hash, hit_cache, latency_ms, timestamp)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        opts.correlationId,
        opts.sessionId,
        opts.topic,
        opts.triggerReason,
        opts.artifactHash ?? null,
        opts.hitCache ? 1 : 0,
        opts.latencyMs,
        ts,
      );
  } catch (err) {
    log.warn('[telemetry] invocation insert failed', err);
  }
  appendMirror(state, 'invocation', {
    id,
    correlationId: opts.correlationId,
    sessionId: opts.sessionId,
    topic: opts.topic,
    triggerReason: opts.triggerReason,
    artifactHash: opts.artifactHash ?? null,
    hitCache: opts.hitCache,
    latencyMs: opts.latencyMs,
    timestamp: ts,
  });
}
