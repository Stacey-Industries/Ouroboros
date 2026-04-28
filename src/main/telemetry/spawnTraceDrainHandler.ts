/**
 * spawnTraceDrainHandler.ts — Wave 53a Phase B
 *
 * Drain handler for the 'spawn-trace' queue surface. Registered at IDE boot
 * via `registerSpawnTraceHandler()`; processes records written by the
 * `session_start_spawn_cost.mjs` hook during external (and internal) Claude
 * Code sessions.
 *
 * Redaction
 * ─────────
 * The hook captures raw argv and writes it to the queue. Redaction happens
 * here, drain-side, using the canonical `redactArgv` from `traceBatcher.ts`.
 * This keeps the hook script free of duplicated regex logic and ensures the
 * single source-of-truth redactor is always applied.
 *
 * Dedup design
 * ─────────────
 * Internal sessions emit a spawn trace via `claudeStreamJsonRunner.ts`
 * (IDE-side, real-time) AND via the SessionStart hook on next drain. The
 * IDE-side record lands in `orchestration_traces` immediately; by the time
 * the drain runs, it is already present.
 *
 * Dedup is two-tier:
 *   1. Per-record DB check: `queryTraces(sessionId)` returns existing rows;
 *      if any have phase === 'spawn' the record is skipped.
 *   2. In-memory Set: catches duplicate records for the same sessionId within
 *      a single drain batch, without needing a second DB round-trip.
 */

import log from '../logger';
import {
  SPAWN_TRACE_SCHEMA_VERSION,
  SPAWN_TRACE_SURFACE,
  type SpawnTraceRecord,
} from './spawnTraceSchema';
import { registerSurfaceHandler } from './telemetryDrain';
import type { QueueRecord } from './telemetryQueue';
import { getTelemetryStore } from './telemetryStore';
import { enqueueTrace, redactArgv } from './traceBatcher';

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function isValidPayload(p: unknown): p is SpawnTraceRecord {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.sessionId === 'string' &&
    Array.isArray(obj.argv) &&
    typeof obj.cwdHash === 'string' &&
    typeof obj.ts === 'number'
  );
}

// ---------------------------------------------------------------------------
// Dedup helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a spawn trace for `sessionId` already exists in the DB.
 * Uses `queryTraces(sessionId)` which returns all trace rows for that session;
 * we scan for any with phase === 'spawn'.
 */
function hasExistingSpawnTrace(sessionId: string): boolean {
  try {
    const store = getTelemetryStore();
    if (!store) return false;
    const rows = store.queryTraces(sessionId);
    return rows.some((r) => r.phase === 'spawn');
  } catch (err) {
    log.warn('[spawn-trace-drain] dedup DB check failed for session', sessionId, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handler factory — exported for direct testing without mocking the drain API
// ---------------------------------------------------------------------------

function checkAndGuard(
  record: QueueRecord,
  seenInBatch: Set<string>,
  dbCheck: (sessionId: string) => boolean,
): SpawnTraceRecord | null {
  if (record.schemaVersion !== SPAWN_TRACE_SCHEMA_VERSION) {
    log.warn(
      '[spawn-trace-drain] unsupported schemaVersion',
      record.schemaVersion,
      record.recordId,
    );
    return null;
  }
  const payload = record.payload;
  if (!isValidPayload(payload)) {
    log.warn('[spawn-trace-drain] invalid payload shape — skipping', record.recordId);
    return null;
  }
  if (seenInBatch.has(payload.sessionId)) {
    log.info('[spawn-trace-drain] dedup (batch): skipping', payload.sessionId);
    return null;
  }
  if (dbCheck(payload.sessionId)) {
    log.info('[spawn-trace-drain] dedup (db): skipping', payload.sessionId);
    seenInBatch.add(payload.sessionId);
    return null;
  }
  return payload;
}

/**
 * Create a standalone handler with its own in-memory dedup set.
 *
 * @param seenInBatch - Set of sessionIds already processed in this drain run.
 *   Callers may pre-seed it for testing. The set is mutated as records land.
 * @param dbCheck - Injectable dedup checker; defaults to `hasExistingSpawnTrace`.
 *   Tests pass a stub to avoid DB access.
 */
export function createSpawnTraceHandler(
  seenInBatch: Set<string>,
  dbCheck: (sessionId: string) => boolean = hasExistingSpawnTrace,
) {
  return function handleSpawnTraceRecord(record: QueueRecord): void {
    const payload = checkAndGuard(record, seenInBatch, dbCheck);
    if (!payload) return;

    // Redact drain-side; hook stores raw argv so we own the canonical redaction.
    enqueueTrace({
      traceId: record.recordId,
      sessionId: payload.sessionId,
      kind: 'spawn',
      payload: { argv: redactArgv(payload.argv), cwdHash: payload.cwdHash, timestamp: payload.ts },
    });

    seenInBatch.add(payload.sessionId);
    log.info('[spawn-trace-drain] enqueued spawn trace for session', payload.sessionId);
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the spawn-trace drain handler. Call once at IDE boot before
 * `runParityQueueDrain()` fires, so the handler is in place when the drain
 * dispatches records from the 'spawn-trace' surface.
 */
export function registerSpawnTraceHandler(): void {
  registerSurfaceHandler(SPAWN_TRACE_SURFACE, createSpawnTraceHandler(new Set<string>()), [
    SPAWN_TRACE_SCHEMA_VERSION,
  ]);
  log.info('[spawn-trace-drain] handler registered');
}
