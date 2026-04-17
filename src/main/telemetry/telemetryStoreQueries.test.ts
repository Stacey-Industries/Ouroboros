/**
 * telemetryStoreQueries.test.ts — Smoke tests for the extracted query helpers.
 *
 * Uses an in-memory better-sqlite3 database so no filesystem is touched.
 */

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { TELEMETRY_SCHEMA_SQL } from './telemetryStoreHelpers';
import {
  queryEvents,
  queryInvocations,
  queryOutcomes,
  queryTraces,
} from './telemetryStoreQueries';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(TELEMETRY_SCHEMA_SQL);
  return db;
}

function insertEvent(db: ReturnType<typeof makeDb>, overrides: Record<string, unknown> = {}) {
  const id = overrides.id ?? 'evt-1';
  db.prepare(
    'INSERT INTO events (id, type, session_id, correlation_id, timestamp, payload) VALUES (?,?,?,?,?,?)',
  ).run(
    id,
    overrides.type ?? 'pre_tool_use',
    overrides.session_id ?? 'sess-1',
    overrides.correlation_id ?? 'corr-1',
    overrides.timestamp ?? 1000,
    overrides.payload ?? '{}',
  );
  return id as string;
}

const INV_DEFAULTS = {
  id: 'inv-1',
  correlation_id: 'corr-1',
  session_id: 'sess-1',
  topic: 'react hooks',
  trigger_reason: 'explicit',
  artifact_hash: null as unknown,
  hit_cache: 0,
  latency_ms: 420,
  timestamp: 2000,
};

function insertInvocation(db: ReturnType<typeof makeDb>, overrides: Partial<typeof INV_DEFAULTS> = {}) {
  const v = { ...INV_DEFAULTS, ...overrides };
  db.prepare(
    'INSERT INTO research_invocations (id, correlation_id, session_id, topic, trigger_reason, artifact_hash, hit_cache, latency_ms, timestamp) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(v.id, v.correlation_id, v.session_id, v.topic, v.trigger_reason, v.artifact_hash, v.hit_cache, v.latency_ms, v.timestamp);
  return v.id;
}

// ─── queryEvents ──────────────────────────────────────────────────────────────

describe('queryEvents', () => {
  it('returns all events when no filter given', () => {
    const db = makeDb();
    insertEvent(db, { id: 'e1', session_id: 's1' });
    insertEvent(db, { id: 'e2', session_id: 's2' });
    const rows = queryEvents(db, {});
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by sessionId', () => {
    const db = makeDb();
    insertEvent(db, { id: 'e1', session_id: 'only' });
    insertEvent(db, { id: 'e2', session_id: 'other' });
    const rows = queryEvents(db, { sessionId: 'only' });
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe('only');
  });

  it('filters by type', () => {
    const db = makeDb();
    insertEvent(db, { id: 'e1', type: 'agent_start', session_id: 's1' });
    insertEvent(db, { id: 'e2', type: 'pre_tool_use', session_id: 's1' });
    const rows = queryEvents(db, { type: 'agent_start' });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('agent_start');
  });

  it('filters by sessionId + type together', () => {
    const db = makeDb();
    insertEvent(db, { id: 'e1', session_id: 'sa', type: 'pre_tool_use' });
    insertEvent(db, { id: 'e2', session_id: 'sa', type: 'agent_start' });
    insertEvent(db, { id: 'e3', session_id: 'sb', type: 'pre_tool_use' });
    const rows = queryEvents(db, { sessionId: 'sa', type: 'pre_tool_use' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('e1');
  });

  it('respects limit + offset', () => {
    const db = makeDb();
    for (let i = 0; i < 5; i++) {
      insertEvent(db, { id: `e${i}`, timestamp: i, session_id: 'pg' });
    }
    const page = queryEvents(db, { sessionId: 'pg', limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
  });
});

// ─── queryOutcomes ────────────────────────────────────────────────────────────

describe('queryOutcomes', () => {
  it('returns empty array when no outcomes exist for event', () => {
    const db = makeDb();
    insertEvent(db, { id: 'evt-no-outcome' });
    const rows = queryOutcomes(db, 'evt-no-outcome');
    expect(rows).toHaveLength(0);
  });

  it('returns outcome rows for a given eventId', () => {
    const db = makeDb();
    insertEvent(db, { id: 'evt-with-outcome' });
    db.prepare(
      'INSERT INTO outcomes (event_id, kind, exit_code, duration_ms, stderr_hash, signals, confidence) VALUES (?,?,?,?,?,?,?)',
    ).run('evt-with-outcome', 'pty_exit', 0, 1200, null, '[]', 'high');
    const rows = queryOutcomes(db, 'evt-with-outcome');
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('pty_exit');
    expect(rows[0].confidence).toBe('high');
  });
});

// ─── queryTraces ──────────────────────────────────────────────────────────────

describe('queryTraces', () => {
  it('returns empty array when no traces exist', () => {
    const db = makeDb();
    const rows = queryTraces(db, 'sess-none', 100);
    expect(rows).toHaveLength(0);
  });

  it('returns traces for a session ordered by timestamp DESC', () => {
    const db = makeDb();
    db.prepare(
      'INSERT INTO orchestration_traces (id, trace_id, session_id, phase, timestamp, payload) VALUES (?,?,?,?,?,?)',
    ).run('t1', 'tr1', 'sess-t', 'build', 100, '{}');
    db.prepare(
      'INSERT INTO orchestration_traces (id, trace_id, session_id, phase, timestamp, payload) VALUES (?,?,?,?,?,?)',
    ).run('t2', 'tr1', 'sess-t', 'select', 200, '{}');
    const rows = queryTraces(db, 'sess-t', 10);
    expect(rows).toHaveLength(2);
    expect(rows[0].timestamp).toBe(200);
  });
});

// ─── queryInvocations ────────────────────────────────────────────────────────

describe('queryInvocations', () => {
  it('returns all rows when no filter given', () => {
    const db = makeDb();
    insertInvocation(db, { id: 'i1', session_id: 'sa' });
    insertInvocation(db, { id: 'i2', session_id: 'sb' });
    const rows = queryInvocations(db);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by sessionId', () => {
    const db = makeDb();
    insertInvocation(db, { id: 'i1', session_id: 'target' });
    insertInvocation(db, { id: 'i2', session_id: 'other' });
    const rows = queryInvocations(db, { sessionId: 'target' });
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe('target');
  });

  it('filters by since + until', () => {
    const db = makeDb();
    insertInvocation(db, { id: 'i1', timestamp: 1000 });
    insertInvocation(db, { id: 'i2', timestamp: 5000 });
    insertInvocation(db, { id: 'i3', timestamp: 9000 });
    const rows = queryInvocations(db, { since: 2000, until: 8000 });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('i2');
  });

  it('maps hit_cache integer to boolean correctly', () => {
    const db = makeDb();
    insertInvocation(db, { id: 'i-hit', hit_cache: 1, session_id: 'sc' });
    insertInvocation(db, { id: 'i-miss', hit_cache: 0, session_id: 'sc' });
    const rows = queryInvocations(db, { sessionId: 'sc' });
    const hit = rows.find((r) => r.id === 'i-hit');
    const miss = rows.find((r) => r.id === 'i-miss');
    expect(hit?.hitCache).toBe(true);
    expect(miss?.hitCache).toBe(false);
  });

  it('preserves latency_ms numeric value', () => {
    const db = makeDb();
    insertInvocation(db, { id: 'i-lat', latency_ms: 1234 });
    const rows = queryInvocations(db, {});
    const row = rows.find((r) => r.id === 'i-lat');
    expect(row?.latencyMs).toBe(1234);
  });

  it('returns null artifact_hash when not set', () => {
    const db = makeDb();
    insertInvocation(db, { id: 'i-no-hash', artifact_hash: null });
    const rows = queryInvocations(db, {});
    const row = rows.find((r) => r.id === 'i-no-hash');
    expect(row?.artifactHash).toBeNull();
  });

  it('returns the stored artifact_hash string when set', () => {
    const db = makeDb();
    insertInvocation(db, { id: 'i-hash', artifact_hash: 'abc123' });
    const rows = queryInvocations(db, {});
    const row = rows.find((r) => r.id === 'i-hash');
    expect(row?.artifactHash).toBe('abc123');
  });
});
