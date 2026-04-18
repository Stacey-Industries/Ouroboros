/**
 * timeoutMetrics.test.ts — Unit tests for per-class timeout counters.
 *
 * Wave 33a Phase F.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./channelCatalog', () => ({
  CATALOG_LOOKUP: new Map([
    ['perf:ping',            { class: 'always',       timeoutClass: 'short'  }],
    ['config:get',           { class: 'always',       timeoutClass: 'short'  }],
    ['files:readFile',       { class: 'paired-read',  timeoutClass: 'normal' }],
    ['agentChat:sendMessage',{ class: 'paired-write', timeoutClass: 'long'   }],
  ]),
}));

import {
  getTimeoutStats,
  incrementTimeout,
  resetTimeoutStats,
} from './timeoutMetrics';

// ─── Helpers ──────────────────────────────────────────────────────────────────

afterEach(() => {
  resetTimeoutStats();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getTimeoutStats', () => {
  it('returns zero counts initially', () => {
    expect(getTimeoutStats()).toEqual({ short: 0, normal: 0, long: 0 });
  });

  it('returns a snapshot (not a live reference)', () => {
    const snap1 = getTimeoutStats();
    incrementTimeout('perf:ping'); // short
    const snap2 = getTimeoutStats();
    expect(snap1.short).toBe(0);
    expect(snap2.short).toBe(1);
  });
});

describe('incrementTimeout', () => {
  it('increments short counter for a short-class channel', () => {
    incrementTimeout('perf:ping');
    expect(getTimeoutStats()).toMatchObject({ short: 1, normal: 0, long: 0 });
  });

  it('increments short counter multiple times', () => {
    incrementTimeout('perf:ping');
    incrementTimeout('config:get');
    expect(getTimeoutStats().short).toBe(2);
  });

  it('increments normal counter for a normal-class channel', () => {
    incrementTimeout('files:readFile');
    expect(getTimeoutStats()).toMatchObject({ short: 0, normal: 1, long: 0 });
  });

  it('increments long counter for a long-class channel', () => {
    incrementTimeout('agentChat:sendMessage');
    expect(getTimeoutStats()).toMatchObject({ short: 0, normal: 0, long: 1 });
  });

  it('defaults to normal for unclassified channels', () => {
    incrementTimeout('nonexistent:channel');
    expect(getTimeoutStats()).toMatchObject({ short: 0, normal: 1, long: 0 });
  });

  it('accumulates independently across all three classes', () => {
    incrementTimeout('perf:ping');            // short
    incrementTimeout('perf:ping');            // short
    incrementTimeout('files:readFile');        // normal
    incrementTimeout('agentChat:sendMessage'); // long
    incrementTimeout('agentChat:sendMessage'); // long
    incrementTimeout('agentChat:sendMessage'); // long
    expect(getTimeoutStats()).toEqual({ short: 2, normal: 1, long: 3 });
  });
});

describe('resetTimeoutStats', () => {
  it('resets all counters to zero', () => {
    incrementTimeout('perf:ping');
    incrementTimeout('files:readFile');
    incrementTimeout('agentChat:sendMessage');
    resetTimeoutStats();
    expect(getTimeoutStats()).toEqual({ short: 0, normal: 0, long: 0 });
  });
});
