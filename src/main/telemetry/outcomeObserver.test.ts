/**
 * outcomeObserver.test.ts — Unit tests for the outcome observer.
 *
 * Uses vi.fn() mocks for TelemetryStore — no real DB opened.
 * Uses vi.useFakeTimers() for deterministic correlation-window checks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  _resetForTests,
  closeOutcomeObserver,
  createOutcomeObserver,
  getOutcomeObserver,
  initOutcomeObserver,
} from './outcomeObserver';
import type { TelemetryStore } from './telemetryStore';

// ─── Mock store factory ───────────────────────────────────────────────────────

function makeMockStore(): TelemetryStore {
  return {
    record: vi.fn(),
    recordOutcome: vi.fn(),
    recordTrace: vi.fn(),
    queryEvents: vi.fn(() => []),
    queryOutcomes: vi.fn(() => []),
    queryTraces: vi.fn(() => []),
    close: vi.fn(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePtyExitArgs(sessionId = 'sess-1', overrides: Record<string, unknown> = {}) {
  return {
    sessionId,
    cwd: '/projects/foo',
    exitCode: 0 as number | null,
    signal: null as NodeJS.Signals | null,
    durationMs: 2000,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createOutcomeObserver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetForTests();
  });

  describe('onPtyExit — confidence levels', () => {
    it('writes high-confidence outcome when delta < 5s', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      vi.setSystemTime(1000);
      obs.noteToolUseEvent('sess-1', 'evt-1', 1000);

      vi.setSystemTime(2500);
      obs.onPtyExit(makePtyExitArgs('sess-1', { durationMs: 1500 }));

      expect(store.recordOutcome).toHaveBeenCalledOnce();
      expect(store.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt-1',
          kind: 'exit',
          confidence: 'high',
        }),
      );
    });

    it('writes medium-confidence outcome when delta is 10s', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      vi.setSystemTime(0);
      obs.noteToolUseEvent('sess-2', 'evt-2', 0);

      vi.setSystemTime(10_000);
      obs.onPtyExit(makePtyExitArgs('sess-2', { durationMs: 10_000 }));

      expect(store.recordOutcome).toHaveBeenCalledOnce();
      expect(store.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ confidence: 'medium' }),
      );
    });

    it('writes low-confidence outcome when delta is 60s (still writes)', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      vi.setSystemTime(0);
      obs.noteToolUseEvent('sess-3', 'evt-3', 0);

      // Delta = 60s — beyond 30s medium threshold; spec says write with 'low'
      vi.setSystemTime(60_000);
      obs.onPtyExit(makePtyExitArgs('sess-3', { durationMs: 60_000 }));

      expect(store.recordOutcome).toHaveBeenCalledOnce();
      expect(store.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ confidence: 'low' }),
      );
    });

    it('writes medium-confidence outcome at 29s (just inside medium window)', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      vi.setSystemTime(0);
      obs.noteToolUseEvent('sess-med', 'evt-med', 0);

      // 29s delta — inside the 5s–30s medium band
      vi.setSystemTime(29_000);
      obs.onPtyExit(makePtyExitArgs('sess-med', { durationMs: 29_000 }));

      expect(store.recordOutcome).toHaveBeenCalledOnce();
      expect(store.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ confidence: 'medium' }),
      );
    });
  });

  describe('onPtyExit — no correlation cases', () => {
    it('does not write a row when no prior tool_use event exists for session', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      vi.setSystemTime(1000);
      obs.onPtyExit(makePtyExitArgs('unknown-sess'));

      expect(store.recordOutcome).not.toHaveBeenCalled();
    });

    it('does not write a row when exit is for a different session (cross-session isolation)', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      vi.setSystemTime(1000);
      obs.noteToolUseEvent('sess-A', 'evt-A', 1000);

      vi.setSystemTime(2000);
      obs.onPtyExit(makePtyExitArgs('sess-B'));

      expect(store.recordOutcome).not.toHaveBeenCalled();
    });
  });

  describe('noteToolUseEvent — LRU eviction at 1001 entries', () => {
    it('evicts oldest entry when capacity is exceeded', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      // Fill 1000 entries: session-0 has timestamp 0 (oldest)
      for (let i = 0; i < 1000; i++) {
        obs.noteToolUseEvent(`session-${i}`, `evt-${i}`, i);
      }

      // Insert 1001st entry — session-0 (ts=0) should be evicted
      obs.noteToolUseEvent('session-overflow', 'evt-overflow', 1000);

      // Try to correlate session-0 — it was evicted
      vi.setSystemTime(1500);
      obs.onPtyExit(makePtyExitArgs('session-0', { durationMs: 500 }));
      expect(store.recordOutcome).not.toHaveBeenCalled();

      // session-overflow should still correlate
      vi.clearAllMocks();
      obs.onPtyExit(makePtyExitArgs('session-overflow', { durationMs: 500 }));
      expect(store.recordOutcome).toHaveBeenCalledOnce();
    });
  });

  describe('onConflictSignal', () => {
    it('writes a conflict outcome row with high confidence linked to correlationId', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      obs.onConflictSignal({
        sessionId: 'sess-conflict',
        filePath: '/projects/foo/src/bar.ts',
        correlationId: 'corr-xyz',
      });

      expect(store.recordOutcome).toHaveBeenCalledOnce();
      expect(store.recordOutcome).toHaveBeenCalledWith({
        eventId: 'corr-xyz',
        kind: 'conflict',
        signals: ['/projects/foo/src/bar.ts'],
        confidence: 'high',
      });
    });
  });

  describe('close()', () => {
    it('clears internal state so subsequent exits do not correlate', () => {
      const store = makeMockStore();
      const obs = createOutcomeObserver(store);

      vi.setSystemTime(1000);
      obs.noteToolUseEvent('sess-close', 'evt-close', 1000);
      obs.close();

      vi.setSystemTime(2000);
      obs.onPtyExit(makePtyExitArgs('sess-close'));

      expect(store.recordOutcome).not.toHaveBeenCalled();
    });
  });
});

describe('singleton API', () => {
  afterEach(() => {
    _resetForTests();
  });

  it('getOutcomeObserver returns null before init', () => {
    expect(getOutcomeObserver()).toBeNull();
  });

  it('initOutcomeObserver sets the singleton', () => {
    const store = makeMockStore();
    initOutcomeObserver(store);
    expect(getOutcomeObserver()).not.toBeNull();
  });

  it('closeOutcomeObserver clears the singleton', () => {
    const store = makeMockStore();
    initOutcomeObserver(store);
    closeOutcomeObserver();
    expect(getOutcomeObserver()).toBeNull();
  });

  it('initOutcomeObserver is idempotent (second call is no-op)', () => {
    const store = makeMockStore();
    initOutcomeObserver(store);
    const first = getOutcomeObserver();
    initOutcomeObserver(store);
    expect(getOutcomeObserver()).toBe(first);
  });
});
