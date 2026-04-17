/**
 * telemetryStore.test.ts
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HookPayload } from '../hooks';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { openTelemetryStore, setFlagEnabledOverride } from './telemetryStore';
import { TELEMETRY_SCHEMA_SQL } from './telemetryStoreHelpers';

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `telem-test-${crypto.randomUUID()}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-local path under os.tmpdir()
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTmpDir(dir: string): void {
   
  fs.rmSync(dir, { recursive: true, force: true });
}

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'sess-test',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('record() → queryEvents() round-trip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    cleanTmpDir(tmpDir);
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('enqueues 3 events and returns all 3 after flush', () => {
    vi.useFakeTimers();
    const store = openTelemetryStore(tmpDir);

    store.record(makePayload({ sessionId: 'sess-1', type: 'pre_tool_use' }));
    store.record(makePayload({ sessionId: 'sess-1', type: 'post_tool_use' }));
    store.record(makePayload({ sessionId: 'sess-1', type: 'agent_start' }));

    vi.advanceTimersByTime(100);

    const events = store.queryEvents({ sessionId: 'sess-1' });
    expect(events).toHaveLength(3);
    store.close();
  });

  it('batch flush happens within 100ms window', () => {
    vi.useFakeTimers();
    const store = openTelemetryStore(tmpDir);

    store.record(makePayload({ sessionId: 'sess-flush' }));

    const before = store.queryEvents({ sessionId: 'sess-flush' });
    expect(before).toHaveLength(0);

    vi.advanceTimersByTime(100);

    const after = store.queryEvents({ sessionId: 'sess-flush' });
    expect(after).toHaveLength(1);
    store.close();
  });

  it('WAL mode is active', () => {
    const store = openTelemetryStore(tmpDir);
    const dbPath = path.join(tmpDir, 'telemetry', 'telemetry.db');
     
    const db = new Database(dbPath);
    db.exec(TELEMETRY_SCHEMA_SQL);
    const row = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(row[0].journal_mode).toBe('wal');
    db.close();
    store.close();
  });
});

describe('queryEvents pagination', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    vi.useFakeTimers();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    cleanTmpDir(tmpDir);
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('returns correct slice with limit and offset', () => {
    const store = openTelemetryStore(tmpDir);

    for (let i = 0; i < 150; i++) {
      store.record(makePayload({ sessionId: 'sess-page', timestamp: i }));
    }
    vi.advanceTimersByTime(100);

    const page = store.queryEvents({ sessionId: 'sess-page', limit: 50, offset: 50 });
    expect(page).toHaveLength(50);
    expect(page[0].timestamp).toBe(99);
    store.close();
  });
});

describe('close() flushes pending queue', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    cleanTmpDir(tmpDir);
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('persists 5 enqueued events when closed before interval fires', () => {
    vi.useFakeTimers();
    const store = openTelemetryStore(tmpDir);

    for (let i = 0; i < 5; i++) {
      store.record(makePayload({ sessionId: 'sess-close', timestamp: i }));
    }
    store.close();

    const store2 = openTelemetryStore(tmpDir);
    vi.advanceTimersByTime(0);
    const events = store2.queryEvents({ sessionId: 'sess-close' });
    expect(events).toHaveLength(5);
    store2.close();
  });
});

describe('feature flag off', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanTmpDir(tmpDir);
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('record() is a no-op when flag is false', () => {
    vi.useFakeTimers();
    setFlagEnabledOverride(false);
    const store = openTelemetryStore(tmpDir);

    store.record(makePayload({ sessionId: 'sess-flag-off' }));
    vi.advanceTimersByTime(100);

    const events = store.queryEvents({ sessionId: 'sess-flag-off' });
    expect(events).toHaveLength(0);
    store.close();
  });
});

describe('recordInvocation → queryInvocations round-trip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    cleanTmpDir(tmpDir);
    setFlagEnabledOverride(null);
  });

  it('persists an invocation and reads it back', () => {
    const store = openTelemetryStore(tmpDir);
    store.recordInvocation({
      correlationId: 'corr-abc',
      sessionId: 'sess-inv',
      topic: 'react suspense',
      triggerReason: 'explicit',
      hitCache: false,
      latencyMs: 800,
      artifactHash: 'deadbeef',
    });
    const rows = store.queryInvocations({ sessionId: 'sess-inv' });
    expect(rows).toHaveLength(1);
    expect(rows[0].correlationId).toBe('corr-abc');
    expect(rows[0].topic).toBe('react suspense');
    expect(rows[0].triggerReason).toBe('explicit');
    expect(rows[0].hitCache).toBe(false);
    expect(rows[0].latencyMs).toBe(800);
    expect(rows[0].artifactHash).toBe('deadbeef');
    store.close();
  });

  it('round-trips hit_cache = true correctly', () => {
    const store = openTelemetryStore(tmpDir);
    store.recordInvocation({
      correlationId: 'corr-hit',
      sessionId: 'sess-hit',
      topic: 'next.js routing',
      triggerReason: 'auto',
      hitCache: true,
      latencyMs: 0,
      artifactHash: null,
    });
    const rows = store.queryInvocations({ sessionId: 'sess-hit' });
    expect(rows[0].hitCache).toBe(true);
    expect(rows[0].latencyMs).toBe(0);
    expect(rows[0].artifactHash).toBeNull();
    store.close();
  });

  it('preserves latency_ms numeric value precisely', () => {
    const store = openTelemetryStore(tmpDir);
    store.recordInvocation({
      correlationId: 'corr-lat',
      sessionId: 'sess-lat',
      topic: 'prisma queries',
      triggerReason: 'hook',
      hitCache: false,
      latencyMs: 12345,
      artifactHash: null,
    });
    const rows = store.queryInvocations({});
    const row = rows.find((r) => r.correlationId === 'corr-lat');
    expect(row?.latencyMs).toBe(12345);
    store.close();
  });

  it('filters by since + until', () => {
    const store = openTelemetryStore(tmpDir);
    const base = 1_700_000_000_000;
    store.recordInvocation({
      correlationId: 'c1', sessionId: 's1', topic: 't1',
      triggerReason: 'other', hitCache: false, latencyMs: 0, artifactHash: null,
      timestamp: base,
    });
    store.recordInvocation({
      correlationId: 'c2', sessionId: 's1', topic: 't2',
      triggerReason: 'other', hitCache: false, latencyMs: 0, artifactHash: null,
      timestamp: base + 5000,
    });
    store.recordInvocation({
      correlationId: 'c3', sessionId: 's1', topic: 't3',
      triggerReason: 'other', hitCache: false, latencyMs: 0, artifactHash: null,
      timestamp: base + 10_000,
    });
    const rows = store.queryInvocations({ since: base + 1000, until: base + 9000 });
    expect(rows).toHaveLength(1);
    expect(rows[0].correlationId).toBe('c2');
    store.close();
  });

  it('is a no-op when flag is disabled', () => {
    setFlagEnabledOverride(false);
    const store = openTelemetryStore(tmpDir);
    store.recordInvocation({
      correlationId: 'corr-flag-off',
      sessionId: 'sess-flag-off',
      topic: 'anything',
      triggerReason: 'other',
      hitCache: false,
      latencyMs: 0,
      artifactHash: null,
    });
    const rows = store.queryInvocations({ sessionId: 'sess-flag-off' });
    expect(rows).toHaveLength(0);
    store.close();
  });
});

describe('auto-correlationId', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    vi.useFakeTimers();
    setFlagEnabledOverride(true);
  });

  afterEach(() => {
    cleanTmpDir(tmpDir);
    setFlagEnabledOverride(null);
    vi.useRealTimers();
  });

  it('generates a UUID when payload omits correlationId', () => {
    const store = openTelemetryStore(tmpDir);
    store.record(makePayload({ sessionId: 'sess-uuid' }));
    vi.advanceTimersByTime(100);

    const events = store.queryEvents({ sessionId: 'sess-uuid' });
    expect(events).toHaveLength(1);
    expect(events[0].correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    store.close();
  });
});
