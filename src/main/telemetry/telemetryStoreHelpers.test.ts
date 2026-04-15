/**
 * telemetryStoreHelpers.test.ts
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  purgeRetainedRows,
  rowToOrchestrationTrace,
  rowToOutcome,
  rowToTelemetryEvent,
  TELEMETRY_SCHEMA_SQL,
} from './telemetryStoreHelpers';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function openMemDb() {
  const db = new Database(':memory:');
  db.exec(TELEMETRY_SCHEMA_SQL);
  return db;
}

function insertEvent(
  db: ReturnType<typeof openMemDb>,
  id: string,
  timestamp: number,
  payload: unknown = {},
) {
  db.prepare(
    'INSERT INTO events (id, type, session_id, correlation_id, timestamp, payload) VALUES (?,?,?,?,?,?)',
  ).run(id, 'test_event', 'sess-1', 'corr-1', timestamp, JSON.stringify(payload));
}

// ─── DDL ─────────────────────────────────────────────────────────────────────

describe('TELEMETRY_SCHEMA_SQL', () => {
  it('executes without error on :memory: db', () => {
    expect(() => openMemDb()).not.toThrow();
  });

  it('creates all 7 expected tables', () => {
    const db = openMemDb();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(tables).toContain('events');
    expect(tables).toContain('outcomes');
    expect(tables).toContain('orchestration_traces');
    expect(tables).toContain('research_invocations');
    expect(tables).toContain('context_decisions');
    expect(tables).toContain('context_outcomes');
    expect(tables).toContain('schema_meta');
  });

  it('schema_meta insert is idempotent (re-running DDL does not duplicate)', () => {
    const db = openMemDb();
    // Run DDL a second time — INSERT OR IGNORE should not throw or duplicate.
    expect(() => db.exec(TELEMETRY_SCHEMA_SQL)).not.toThrow();
    const rows = db.prepare('SELECT * FROM schema_meta WHERE key = ?').all('schema_version') as Array<{
      key: string;
      value: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('1');
  });
});

// ─── Row mappers ─────────────────────────────────────────────────────────────

describe('rowToTelemetryEvent', () => {
  it('round-trips a domain object through a DB row', () => {
    const db = openMemDb();
    const originalPayload = { tool: 'Bash', args: ['ls'] };
    insertEvent(db, 'evt-1', 1_000_000, originalPayload);

    const row = db.prepare('SELECT * FROM events WHERE id = ?').get('evt-1') as Record<
      string,
      unknown
    >;
    const event = rowToTelemetryEvent(row);

    expect(event.id).toBe('evt-1');
    expect(event.type).toBe('test_event');
    expect(event.sessionId).toBe('sess-1');
    expect(event.correlationId).toBe('corr-1');
    expect(event.timestamp).toBe(1_000_000);
    expect(event.payload).toEqual(originalPayload);
  });
});

describe('rowToOutcome', () => {
  it('round-trips an outcome row', () => {
    const db = openMemDb();
    insertEvent(db, 'evt-2', 2_000_000);
    db.prepare(
      'INSERT INTO outcomes (event_id, kind, exit_code, duration_ms, stderr_hash, signals, confidence) VALUES (?,?,?,?,?,?,?)',
    ).run('evt-2', 'pty_exit', 0, 1234, null, '["SIGTERM"]', 'high');

    const row = db.prepare('SELECT * FROM outcomes WHERE event_id = ?').get('evt-2') as Record<
      string,
      unknown
    >;
    const outcome = rowToOutcome(row);

    expect(outcome.eventId).toBe('evt-2');
    expect(outcome.kind).toBe('pty_exit');
    expect(outcome.exitCode).toBe(0);
    expect(outcome.durationMs).toBe(1234);
    expect(outcome.stderrHash).toBeNull();
    expect(outcome.signals).toEqual(['SIGTERM']);
    expect(outcome.confidence).toBe('high');
  });
});

describe('rowToOrchestrationTrace', () => {
  it('round-trips a trace row', () => {
    const db = openMemDb();
    const tracePayload = { phase: 'context_build', tokens: 512 };
    db.prepare(
      'INSERT INTO orchestration_traces (id, trace_id, session_id, phase, timestamp, payload) VALUES (?,?,?,?,?,?)',
    ).run('trace-1', 'tr-abc', 'sess-1', 'context_build', 3_000_000, JSON.stringify(tracePayload));

    const row = db
      .prepare('SELECT * FROM orchestration_traces WHERE id = ?')
      .get('trace-1') as Record<string, unknown>;
    const trace = rowToOrchestrationTrace(row);

    expect(trace.id).toBe('trace-1');
    expect(trace.traceId).toBe('tr-abc');
    expect(trace.sessionId).toBe('sess-1');
    expect(trace.phase).toBe('context_build');
    expect(trace.timestamp).toBe(3_000_000);
    expect(trace.payload).toEqual(tracePayload);
  });
});

// ─── Retention purge ─────────────────────────────────────────────────────────

describe('purgeRetainedRows', () => {
  let db: ReturnType<typeof openMemDb>;

  beforeEach(() => {
    db = openMemDb();
  });

  afterEach(() => {
    db.close();
  });

  it('deletes only rows older than the cutoff', () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    insertEvent(db, 'old-1', now - 40 * dayMs); // 40 days old — should be purged
    insertEvent(db, 'old-2', now - 35 * dayMs); // 35 days old — should be purged
    insertEvent(db, 'recent', now - 5 * dayMs);  // 5 days old — keep

    const deleted = purgeRetainedRows(db, 30);

    expect(deleted).toBe(2);
    const remaining = db.prepare('SELECT id FROM events').all() as Array<{ id: string }>;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('recent');
  });

  it('returns 0 when nothing is old enough to purge', () => {
    const now = Date.now();
    insertEvent(db, 'fresh', now - 1000);
    expect(purgeRetainedRows(db, 30)).toBe(0);
  });

  it('cascades deletions to outcomes table', () => {
    const now = Date.now();
    insertEvent(db, 'old-evt', now - 40 * 24 * 60 * 60 * 1000);
    db.prepare(
      'INSERT INTO outcomes (event_id, kind, signals, confidence) VALUES (?,?,?,?)',
    ).run('old-evt', 'pty_exit', '[]', 'low');

    purgeRetainedRows(db, 30);

    const outcomes = db.prepare('SELECT * FROM outcomes WHERE event_id = ?').all('old-evt');
    expect(outcomes).toHaveLength(0);
  });
});
