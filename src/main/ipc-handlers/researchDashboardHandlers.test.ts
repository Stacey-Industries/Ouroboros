/**
 * researchDashboardHandlers.test.ts — Unit tests for the research metrics
 * dashboard aggregator (Wave 30 Phase H).
 *
 * Tests cover:
 *   - Empty DB + no JSONL → all zeros, no NaN/Infinity
 *   - Populated data: byTrigger breakdown, cacheHitRate, p95, FP rate
 *   - 60 s result cache: second call returns cached result
 *   - Range filter: 7d excludes records older than 7 days
 */

import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock electron app
vi.mock('electron', () => ({
  app: { getPath: () => '/mock/userData' },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

// Module-level mock state for TelemetryStore
let mockInvocationRows: Record<string, unknown>[] = [];

vi.mock('../telemetry', () => ({
  getTelemetryStore: () => ({
    queryInvocations: (filter: { since?: number; until?: number } = {}) => {
      return mockInvocationRows.filter((r) => {
        if (filter.since !== undefined && (r.timestamp as number) < filter.since) return false;
        return true;
      });
    },
  }),
}));

// Captured fs.readdir / readFile calls for control
let mockFsEntries: Record<string, string[]> = {};
let mockFsFiles: Record<string, string> = {};

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: async (dir: string) => {
      const key = dir.replace(/\\/g, '/');
      // eslint-disable-next-line security/detect-object-injection -- test mock map keyed by trusted path string
      const entries = mockFsEntries[key];
      if (!entries) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return entries;
    },
    readFile: async (fp: string) => {
      const key = (fp as string).replace(/\\/g, '/');
      // eslint-disable-next-line security/detect-object-injection -- test mock map keyed by trusted path string
      const content = mockFsFiles[key];
      if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return content;
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_DIR = '/mock/userData';

function makeInvRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'inv-1',
    correlationId: 'corr-1',
    sessionId: 'sess-1',
    topic: 'react',
    triggerReason: 'hook',
    artifactHash: null,
    hitCache: false,
    latencyMs: 100,
    timestamp: Date.now(),
    ...overrides,
  };
}

function toJsonl(records: Record<string, unknown>[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let getDashboardMetrics: typeof import('./researchDashboardHandlers').getDashboardMetrics;

beforeEach(async () => {
  // Reset mocks
  mockInvocationRows = [];
  mockFsEntries = {};
  mockFsFiles = {};

  // Reset cache between tests by re-importing with a fresh module
  vi.resetModules();

  // Re-mock after resetModules
  vi.mock('electron', () => ({
    app: { getPath: () => '/mock/userData' },
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  }));
  vi.mock('../telemetry', () => ({
    getTelemetryStore: () => ({
      queryInvocations: (filter: { since?: number } = {}) =>
        mockInvocationRows.filter((r) =>
          filter.since === undefined || (r.timestamp as number) >= filter.since,
        ),
    }),
  }));
  vi.mock('node:fs/promises', () => ({
    default: {
      readdir: async (dir: string) => {
        const key = (dir as string).replace(/\\/g, '/');
        // eslint-disable-next-line security/detect-object-injection -- test mock map keyed by trusted path string
        const entries = mockFsEntries[key];
        if (!entries) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return entries;
      },
      readFile: async (fp: string) => {
        const key = (fp as string).replace(/\\/g, '/');
        // eslint-disable-next-line security/detect-object-injection -- test mock map keyed by trusted path string
        const content = mockFsFiles[key];
        if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return content;
      },
    },
  }));

  const mod = await import('./researchDashboardHandlers');
  getDashboardMetrics = mod.getDashboardMetrics;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getDashboardMetrics — empty state', () => {
  it('returns all zeros when DB has no rows and no JSONL files exist', async () => {
    const m = await getDashboardMetrics('7d');
    expect(m.range).toBe('7d');
    expect(m.invocations.total).toBe(0);
    expect(m.invocations.cacheHitRate).toBe(0);
    expect(m.invocations.avgLatencyMs).toBe(0);
    expect(m.invocations.p95LatencyMs).toBe(0);
    expect(m.outcomes.total).toBe(0);
    expect(m.outcomes.acceptanceRate).toBe(0);
    expect(m.correlated.falsePositiveRate).toBe(0);
    expect(m.corrections.total).toBe(0);
    expect(m.corrections.enhancedLibrariesCount).toBe(0);
  });

  it('has no NaN or Infinity in rates with zero data', async () => {
    const m = await getDashboardMetrics('30d');
    const nums = [
      m.invocations.cacheHitRate,
      m.invocations.avgLatencyMs,
      m.invocations.p95LatencyMs,
      m.outcomes.acceptanceRate,
      m.correlated.falsePositiveRate,
    ];
    for (const n of nums) {
      expect(Number.isFinite(n)).toBe(true);
    }
  });
});

describe('getDashboardMetrics — invocation aggregation', () => {
  it('counts byTrigger correctly across all buckets', async () => {
    mockInvocationRows = [
      makeInvRow({ triggerReason: 'hook' }),
      makeInvRow({ triggerReason: 'hook' }),
      makeInvRow({ triggerReason: 'fact-claim' }),
      makeInvRow({ triggerReason: 'slash-command' }),
      makeInvRow({ triggerReason: 'correction' }),
      makeInvRow({ triggerReason: 'explicit' }),  // → other
    ];
    const m = await getDashboardMetrics('all');
    expect(m.invocations.total).toBe(6);
    expect(m.invocations.byTrigger.hook).toBe(2);
    expect(m.invocations.byTrigger['fact-claim']).toBe(1);
    expect(m.invocations.byTrigger.slash).toBe(1);
    expect(m.invocations.byTrigger.correction).toBe(1);
    expect(m.invocations.byTrigger.other).toBe(1);
  });

  it('computes cache hit rate accurately', async () => {
    mockInvocationRows = [
      makeInvRow({ hitCache: true }),
      makeInvRow({ hitCache: true }),
      makeInvRow({ hitCache: false }),
      makeInvRow({ hitCache: false }),
    ];
    const m = await getDashboardMetrics('all');
    expect(m.invocations.cacheHitRate).toBeCloseTo(0.5);
  });

  it('computes p95 on a known latency sample', async () => {
    // 20 rows with latencies 10..200 in steps of 10
    mockInvocationRows = Array.from({ length: 20 }, (_, i) =>
      makeInvRow({ latencyMs: (i + 1) * 10 }),
    );
    const m = await getDashboardMetrics('all');
    // p95 index = floor(20 * 0.95) = 19 → sorted[19] = 200
    expect(m.invocations.p95LatencyMs).toBe(200);
    expect(m.invocations.avgLatencyMs).toBe(105);
  });
});

describe('getDashboardMetrics — outcome aggregation', () => {
  it('aggregates JSONL outcome records correctly', async () => {
    const stamp = today();
    const file = `research-outcomes-${stamp}.jsonl`;
    const records = [
      { outcomeSignal: 'accepted', timestamp: Date.now(), sessionId: 's1', library: 'react' },
      { outcomeSignal: 'accepted', timestamp: Date.now(), sessionId: 's1', library: 'react' },
      { outcomeSignal: 'reverted', timestamp: Date.now(), sessionId: 's1', library: 'zod' },
      { outcomeSignal: 'unknown', timestamp: Date.now(), sessionId: 's1', library: 'other' },
    ];
    // eslint-disable-next-line security/detect-object-injection -- test fixture, key is a trusted constant
    mockFsEntries[BASE_DIR] = [file];
    mockFsFiles[path.posix.join(BASE_DIR, file)] = toJsonl(records);

    const m = await getDashboardMetrics('all');
    expect(m.outcomes.total).toBe(4);
    expect(m.outcomes.accepted).toBe(2);
    expect(m.outcomes.reverted).toBe(1);
    expect(m.outcomes.unknown).toBe(1);
    // acceptanceRate = 2 / (2+1) ≈ 0.667
    expect(m.outcomes.acceptanceRate).toBeCloseTo(2 / 3);
  });

  it('computes false positive rate from invocations + reverted outcomes', async () => {
    mockInvocationRows = [
      makeInvRow(),
      makeInvRow(),
      makeInvRow(),
      makeInvRow(),
    ];
    const stamp = today();
    const file = `research-outcomes-${stamp}.jsonl`;
    const records = [
      { outcomeSignal: 'accepted', timestamp: Date.now() },
      { outcomeSignal: 'reverted', timestamp: Date.now() },
    ];
    // eslint-disable-next-line security/detect-object-injection -- test fixture, key is a trusted constant
    mockFsEntries[BASE_DIR] = [file];
    mockFsFiles[path.posix.join(BASE_DIR, file)] = toJsonl(records);

    const m = await getDashboardMetrics('all');
    // FP rate = reverted / firedCount = 1/4
    expect(m.correlated.falsePositiveRate).toBeCloseTo(0.25);
    expect(m.correlated.falsePositiveCount).toBe(1);
    expect(m.correlated.firedCount).toBe(4);
  });
});

describe('getDashboardMetrics — corrections aggregation', () => {
  it('counts unique libraries from corrections JSONL', async () => {
    const stamp = today();
    const file = `corrections-${stamp}.jsonl`;
    const records = [
      { library: 'react', timestamp: Date.now(), sessionId: 's1' },
      { library: 'react', timestamp: Date.now(), sessionId: 's1' },
      { library: 'zod', timestamp: Date.now(), sessionId: 's1' },
    ];
    // eslint-disable-next-line security/detect-object-injection -- test fixture, key is a trusted constant
    mockFsEntries[BASE_DIR] = [file];
    mockFsFiles[path.posix.join(BASE_DIR, file)] = toJsonl(records);

    const m = await getDashboardMetrics('all');
    expect(m.corrections.total).toBe(3);
    expect(m.corrections.enhancedLibrariesCount).toBe(2);
  });
});

describe('getDashboardMetrics — range filter', () => {
  it('excludes invocation rows older than 7 days', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    mockInvocationRows = [
      makeInvRow({ timestamp: eightDaysAgo }),   // excluded
      makeInvRow({ timestamp: Date.now() }),      // included
    ];
    const m = await getDashboardMetrics('7d');
    expect(m.invocations.total).toBe(1);
  });

  it('excludes outcome records outside the 7d window', async () => {
    const stamp = today();
    const file = `research-outcomes-${stamp}.jsonl`;
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const records = [
      { outcomeSignal: 'accepted', timestamp: eightDaysAgo },  // excluded
      { outcomeSignal: 'reverted', timestamp: Date.now() },     // included
    ];
    // eslint-disable-next-line security/detect-object-injection -- test fixture, key is a trusted constant
    mockFsEntries[BASE_DIR] = [file];
    mockFsFiles[path.posix.join(BASE_DIR, file)] = toJsonl(records);

    const m = await getDashboardMetrics('7d');
    expect(m.outcomes.total).toBe(1);
    expect(m.outcomes.reverted).toBe(1);
  });
});

describe('getDashboardMetrics — 60 s cache', () => {
  it('returns cached result on second call within 60 s', async () => {
    mockInvocationRows = [makeInvRow()];
    const first = await getDashboardMetrics('7d');

    // Add more data — cache should prevent re-query
    mockInvocationRows = [makeInvRow(), makeInvRow(), makeInvRow()];
    const second = await getDashboardMetrics('7d');

    expect(second).toBe(first);  // same reference
    expect(second.invocations.total).toBe(1);
  });

  it('recomputes after cache expires (mock time)', async () => {
    const realDateNow = Date.now;
    mockInvocationRows = [makeInvRow()];
    const first = await getDashboardMetrics('30d');

    // Advance time beyond TTL
    vi.spyOn(Date, 'now').mockReturnValue(realDateNow() + 61_000);
    mockInvocationRows = [makeInvRow(), makeInvRow()];

    const second = await getDashboardMetrics('30d');
    expect(second).not.toBe(first);
    expect(second.invocations.total).toBe(2);

    vi.restoreAllMocks();
  });
});
