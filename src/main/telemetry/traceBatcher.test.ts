/**
 * traceBatcher.test.ts — Unit tests for the trace micro-batch queue.
 *
 * Tests: flush timing, soft-cap immediate flush, overflow sampling,
 * drain-on-shutdown, argv redaction, and head redaction.
 */

import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock getTelemetryStore so we can inspect recordTrace calls without a real DB.
const mockRecordTrace = vi.fn();
vi.mock('./telemetryStore', () => ({
  getTelemetryStore: () => ({ recordTrace: mockRecordTrace }),
}));

import {
  _getQueueForTests,
  _isSamplingActiveForTests,
  _resetTraceBatcherForTests,
  drainTraceBatcher,
  enqueueTrace,
  initTraceBatcher,
  redactArgv,
  redactHead,
  type TraceEntry,
} from './traceBatcher';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(kind: TraceEntry['kind'] = 'spawn'): TraceEntry {
  return {
    traceId: crypto.randomUUID(),
    sessionId: 'sess-test',
    kind,
    payload: { timestamp: Date.now() },
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockRecordTrace.mockClear();
  _resetTraceBatcherForTests();
});

afterEach(() => {
  _resetTraceBatcherForTests();
  vi.useRealTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('enqueueTrace + flush after 500 ms', () => {
  it('flushes enqueued entries after the interval fires', () => {
    initTraceBatcher();
    enqueueTrace(makeEntry('spawn'));
    enqueueTrace(makeEntry('stdin'));

    expect(mockRecordTrace).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(mockRecordTrace).toHaveBeenCalledTimes(2);
  });

  it('does not flush before 500 ms', () => {
    initTraceBatcher();
    enqueueTrace(makeEntry('spawn'));
    vi.advanceTimersByTime(499);
    expect(mockRecordTrace).not.toHaveBeenCalled();
  });

  it('passes correct shape to recordTrace', () => {
    initTraceBatcher();
    const entry = makeEntry('spawn');
    enqueueTrace(entry);
    vi.advanceTimersByTime(500);

    expect(mockRecordTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: entry.traceId,
        sessionId: entry.sessionId,
        phase: 'spawn',
        payload: entry.payload,
      }),
    );
  });
});

describe('soft-cap triggers immediate flush', () => {
  it('flushes synchronously when 200 entries are enqueued', () => {
    initTraceBatcher();
    // Enqueue 199 — no flush yet
    for (let i = 0; i < 199; i++) enqueueTrace(makeEntry('stdout'));
    expect(mockRecordTrace).not.toHaveBeenCalled();

    // 200th entry crosses the soft cap
    enqueueTrace(makeEntry('stdout'));
    expect(mockRecordTrace).toHaveBeenCalled();
  });

  it('queue is empty after soft-cap flush', () => {
    initTraceBatcher();
    for (let i = 0; i < 200; i++) enqueueTrace(makeEntry('stdin'));
    expect(_getQueueForTests()).toHaveLength(0);
  });
});

describe('stdout sampling under burst', () => {
  it('sampling is inactive before overflow threshold', () => {
    initTraceBatcher();
    // Trigger 5 full-flush cycles but all within one window
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let i = 0; i < 200; i++) enqueueTrace(makeEntry('stdout'));
    }
    expect(_isSamplingActiveForTests()).toBe(false);
  });

  it('sampling engages after > 5 consecutive full-flush cycles within 2 s', () => {
    initTraceBatcher();
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 200; i++) enqueueTrace(makeEntry('stdout'));
    }
    expect(_isSamplingActiveForTests()).toBe(true);
  });

  it('spawn entries are always enqueued even when sampling is active', () => {
    initTraceBatcher();
    // Activate sampling
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 200; i++) enqueueTrace(makeEntry('stdout'));
    }
    expect(_isSamplingActiveForTests()).toBe(true);

    mockRecordTrace.mockClear();
    enqueueTrace(makeEntry('spawn'));
    vi.advanceTimersByTime(500);
    expect(mockRecordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'spawn' }),
    );
  });

  it('stdin entries are always enqueued even when sampling is active', () => {
    initTraceBatcher();
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 200; i++) enqueueTrace(makeEntry('stdout'));
    }
    expect(_isSamplingActiveForTests()).toBe(true);

    mockRecordTrace.mockClear();
    enqueueTrace(makeEntry('stdin'));
    vi.advanceTimersByTime(500);
    expect(mockRecordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'stdin' }),
    );
  });
});

describe('drainTraceBatcher', () => {
  it('flushes remaining entries on drain', () => {
    initTraceBatcher();
    enqueueTrace(makeEntry('spawn'));
    enqueueTrace(makeEntry('stdin'));

    // No timer fire — drain should flush synchronously
    drainTraceBatcher();

    expect(mockRecordTrace).toHaveBeenCalledTimes(2);
  });

  it('queue is empty after drain', () => {
    initTraceBatcher();
    enqueueTrace(makeEntry('spawn'));
    drainTraceBatcher();
    expect(_getQueueForTests()).toHaveLength(0);
  });

  it('subsequent timer ticks after drain do not double-flush', () => {
    initTraceBatcher();
    enqueueTrace(makeEntry('spawn'));
    drainTraceBatcher();
    mockRecordTrace.mockClear();

    vi.advanceTimersByTime(1000);
    expect(mockRecordTrace).not.toHaveBeenCalled();
  });
});

describe('redactArgv', () => {
  it('replaces value after sensitive flag', () => {
    const result = redactArgv(['--api-key', 'my-secret-value', '--model', 'sonnet']);
    expect(result).toEqual(['--api-key', '***', '--model', 'sonnet']);
  });

  it('redacts sk- pattern in arbitrary arg', () => {
    const result = redactArgv(['--resume', 'sk-ant-abcdefghij12']);
    expect(result).toEqual(['--resume', '***']);
  });

  it('handles trailing sensitive flag with no following value gracefully', () => {
    const result = redactArgv(['--token']);
    expect(result).toEqual(['--token']);
  });

  it('passes safe args through unchanged', () => {
    const result = redactArgv(['-p', '--output-format', 'stream-json']);
    expect(result).toEqual(['-p', '--output-format', 'stream-json']);
  });

  it('redacts multiple sensitive flags in one argv', () => {
    const argv = ['--api-key', 'key1', '--password', 'pass1', '--safe'];
    expect(redactArgv(argv)).toEqual(['--api-key', '***', '--password', '***', '--safe']);
  });
});

describe('redactHead', () => {
  it('replaces sk- token in head string', () => {
    const head = 'Authorization: Bearer sk-ant-abcdefghijklmn session started';
    expect(redactHead(head)).toBe('Authorization: Bearer *** session started');
  });

  it('passes safe head string through unchanged', () => {
    const head = 'Starting context build for /projects/foo';
    expect(redactHead(head)).toBe(head);
  });

  it('redacts multiple sk- tokens in one string', () => {
    const head = 'key1=sk-ant-aaaaaaaaaa key2=sk-ant-bbbbbbbbbb';
    expect(redactHead(head)).toBe('key1=*** key2=***');
  });
});
