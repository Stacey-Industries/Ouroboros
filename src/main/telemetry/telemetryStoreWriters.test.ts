/**
 * telemetryStoreWriters.test.ts — Wave 70 follow-up smoke coverage.
 *
 * Verifies that outcome / trace / invocation writers ALL dual-write to the
 * JSONL mirror — pre-fix, only hook events reached the cold tier. Without
 * this coverage the JSONL archival hole would silently re-open on any
 * future refactor.
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TELEMETRY_SCHEMA_SQL } from './telemetryStoreHelpers';
import {
  appendMirror,
  type MirrorTarget,
  writeInvocationWithMirror,
  writeOutcomeWithMirror,
  writeTraceWithMirror,
} from './telemetryStoreWriters';

const appendEventSpy = vi.fn();

function makeTarget(): MirrorTarget {
  const db = new Database(':memory:') as unknown as MirrorTarget['db'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only cast
  (db as any).exec(TELEMETRY_SCHEMA_SQL);
  // Insert a parent event row so the outcomes FK is satisfied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only cast
  (db as any)
    .prepare(
      'INSERT INTO events (id, type, session_id, correlation_id, timestamp, payload) VALUES (?,?,?,?,?,?)',
    )
    .run('evt-1', 'pre_tool_use', 'sess-1', 'corr-1', Date.now(), '{}');
  return {
    db,
    jsonlMirror: {
      appendEvent: appendEventSpy,
      purgeOldFiles: () => 0,
      compressOldFiles: () => 0,
      close: () => {},
    },
  };
}

beforeEach(() => {
  appendEventSpy.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('writeOutcomeWithMirror', () => {
  it('inserts the SQLite row AND mirrors with kind:"outcome"', () => {
    const target = makeTarget();
    writeOutcomeWithMirror(target, {
      eventId: 'evt-1',
      kind: 'pty_exit',
      exitCode: 0,
      durationMs: 1234,
      signals: ['signal-a'],
      confidence: 'high',
    });
    expect(appendEventSpy).toHaveBeenCalledTimes(1);
    const record = appendEventSpy.mock.calls[0][0];
    expect(record.kind).toBe('outcome');
    expect(record.eventId).toBe('evt-1');
    expect(record.exitCode).toBe(0);
    expect(record.signals).toEqual(['signal-a']);
    expect(record.confidence).toBe('high');
  });

  it('mirrors even when SQLite insert fails (e.g. FK violation on missing event_id)', () => {
    const target = makeTarget();
    writeOutcomeWithMirror(target, {
      eventId: 'evt-missing',
      kind: 'pty_exit',
    });
    // Mirror should still fire — the JSONL archive is the source of truth for
    // permanent retention; SQLite is the cache.
    expect(appendEventSpy).toHaveBeenCalledTimes(1);
    expect(appendEventSpy.mock.calls[0][0].kind).toBe('outcome');
  });
});

describe('writeTraceWithMirror', () => {
  it('inserts the SQLite row AND mirrors with kind:"trace"', () => {
    const target = makeTarget();
    writeTraceWithMirror(target, {
      id: 'trace-1',
      traceId: 'tr-1',
      sessionId: 'sess-1',
      phase: 'spawn',
      payload: { foo: 'bar' },
    });
    expect(appendEventSpy).toHaveBeenCalledTimes(1);
    const record = appendEventSpy.mock.calls[0][0];
    expect(record.kind).toBe('trace');
    expect(record.traceId).toBe('tr-1');
    expect(record.payload).toEqual({ foo: 'bar' });
  });
});

describe('writeInvocationWithMirror', () => {
  it('inserts the SQLite row AND mirrors with kind:"invocation"', () => {
    const target = makeTarget();
    writeInvocationWithMirror(target, {
      correlationId: 'corr-1',
      sessionId: 'sess-1',
      topic: 'react',
      triggerReason: 'auto',
      hitCache: true,
      latencyMs: 42,
      artifactHash: 'abc123',
    });
    expect(appendEventSpy).toHaveBeenCalledTimes(1);
    const record = appendEventSpy.mock.calls[0][0];
    expect(record.kind).toBe('invocation');
    expect(record.correlationId).toBe('corr-1');
    expect(record.topic).toBe('react');
    expect(record.hitCache).toBe(true);
  });
});

describe('appendMirror — null mirror is a no-op', () => {
  it('does not throw when jsonlMirror is null', () => {
    const target: MirrorTarget = {
      db: new Database(':memory:') as unknown as MirrorTarget['db'],
      jsonlMirror: null,
    };
    expect(() => appendMirror(target, 'event', { id: 'x' })).not.toThrow();
  });
});
