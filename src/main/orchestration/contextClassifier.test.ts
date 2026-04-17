/**
 * contextClassifier.test.ts — Unit tests for the context ranker classifier.
 *
 * All filesystem I/O is mocked via vi.mock('node:fs/promises').
 * The electron module is never imported at top level — lazy require inside
 * reloadContextWeights() means it only fires when filePath is omitted, so
 * tests always pass an explicit path to avoid touching the electron stub.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger before importing classifier
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock fs/promises before importing classifier
vi.mock('node:fs/promises', () => ({
  default: { readFile: vi.fn() },
  readFile: vi.fn(),
}));

import fsPromises from 'node:fs/promises';

import { BUNDLED_CONTEXT_WEIGHTS } from './contextClassifierDefaults';
import {
  getActiveWeights,
  reloadContextWeights,
  resetForTests,
  score,
} from './contextClassifier';
import type { ContextFeatureVec, ContextRankerWeights } from './contextClassifier';

const mockReadFile = vi.mocked(fsPromises.readFile);

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeWeights(overrides: Partial<ContextRankerWeights> = {}): ContextRankerWeights {
  return {
    version: 'test-1',
    featureOrder: ['recencyScore', 'pagerankScore'],
    weights: [1.0, 0.5],
    bias: 0.0,
    metrics: {
      samples: 100,
      syntheticNegatives: 10,
      heldOutAuc: 0.82,
      trainedAt: '2026-01-01T00:00:00Z',
      belowMinSamples: false,
      classBalance: { pos: 60, neg: 40 },
    },
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetForTests();
  mockReadFile.mockReset();
});

afterEach(() => {
  resetForTests();
});

// ── score() ────────────────────────────────────────────────────────────────────

describe('score()', () => {
  it('returns 0.5 when z=0 (zero bias, zero weights, zero features)', () => {
    const w = makeWeights({ weights: [0, 0], bias: 0 });
    const result = score({}, w);
    expect(result).toBeCloseTo(0.5);
  });

  it('returns > 0.5 when positive weight times positive feature value', () => {
    const w = makeWeights({ weights: [2.0, 0], bias: 0 });
    const features: ContextFeatureVec = { recencyScore: 1 };
    expect(score(features, w)).toBeGreaterThan(0.5);
  });

  it('returns < 0.5 when negative weight times positive feature value', () => {
    const w = makeWeights({ weights: [-2.0, 0], bias: 0 });
    const features: ContextFeatureVec = { recencyScore: 1 };
    expect(score(features, w)).toBeLessThan(0.5);
  });

  it('returns value in [0, 1]', () => {
    const w = makeWeights({ weights: [100, 100], bias: 50 });
    const features: ContextFeatureVec = { recencyScore: 1, pagerankScore: 1 };
    const result = score(features, w);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('missing features default to 0.0', () => {
    const w = makeWeights({ weights: [1.0, 0], bias: 0 });
    // recencyScore absent — treated as 0 → z = 0 → sigmoid = 0.5
    const result = score({}, w);
    expect(result).toBeCloseTo(0.5);
  });

  it('warns once per missing feature name, not on every call', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const w = makeWeights({ featureOrder: ['missingFeat'], weights: [1.0], bias: 0 });

    score({}, w);
    score({}, w);
    score({}, w);

    const calls = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('missingFeat'),
    );
    expect(calls.length).toBe(1);
    warnSpy.mockRestore();
  });

  it('unknown features in input (not in featureOrder) are ignored', () => {
    const w = makeWeights({ weights: [1.0, 0], bias: 0 });
    // unknownFeature not in featureOrder — result should be same as missing recencyScore
    const result = score({ unknownFeature: 999 }, w);
    expect(result).toBeCloseTo(0.5);
  });

  it('uses active weights by default when no weights argument supplied', () => {
    // Active weights start as BUNDLED_CONTEXT_WEIGHTS; score with a known feature
    const features: ContextFeatureVec = {};
    // With all zeros, z = bias = -0.5, sigmoid(-0.5) ≈ 0.378
    const result = score(features);
    expect(result).toBeCloseTo(1 / (1 + Math.exp(0.5)), 5);
  });
});

// ── getActiveWeights() ─────────────────────────────────────────────────────────

describe('getActiveWeights()', () => {
  it('returns BUNDLED_CONTEXT_WEIGHTS before any reload', () => {
    expect(getActiveWeights()).toBe(BUNDLED_CONTEXT_WEIGHTS);
  });
});

// ── reloadContextWeights() ─────────────────────────────────────────────────────

describe('reloadContextWeights()', () => {
  it('replaces active weights on valid JSON and updates version', async () => {
    const newWeights = makeWeights({ version: 'retrained-abc' });
    mockReadFile.mockResolvedValueOnce(JSON.stringify(newWeights) as never);

    const result = await reloadContextWeights('/fake/weights.json');

    expect(result.loaded).toBe(true);
    expect(result.version).toBe('retrained-abc');
    expect(getActiveWeights().version).toBe('retrained-abc');
  });

  it('emits info log on successful reload', async () => {
    const logModule = await import('../logger');
    const infoSpy = vi.mocked(logModule.default.info);

    const newWeights = makeWeights({ version: 'v-log-test' });
    mockReadFile.mockResolvedValueOnce(JSON.stringify(newWeights) as never);

    await reloadContextWeights('/fake/weights.json');

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('v-log-test'),
    );
  });

  it('returns { loaded: false, reason: file-missing } when file not found', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValueOnce(err as never);

    const result = await reloadContextWeights('/fake/missing.json');

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('file-missing');
    expect(getActiveWeights()).toBe(BUNDLED_CONTEXT_WEIGHTS);
  });

  it('returns { loaded: false, reason: parse-error } on malformed JSON', async () => {
    mockReadFile.mockResolvedValueOnce('{ not valid json' as never);

    const result = await reloadContextWeights('/fake/bad.json');

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('parse-error');
    expect(getActiveWeights()).toBe(BUNDLED_CONTEXT_WEIGHTS);
  });

  it('returns { loaded: false, reason: schema-mismatch } when weights.length !== featureOrder.length', async () => {
    const bad = makeWeights({ weights: [1.0] }); // featureOrder has 2 entries, weights has 1
    mockReadFile.mockResolvedValueOnce(JSON.stringify(bad) as never);

    const result = await reloadContextWeights('/fake/bad-shape.json');

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('schema-mismatch');
    expect(getActiveWeights()).toBe(BUNDLED_CONTEXT_WEIGHTS);
  });

  it('rejects NaN in weights array', async () => {
    const bad = { ...makeWeights(), weights: [NaN, 0.5] };
    mockReadFile.mockResolvedValueOnce(JSON.stringify(bad) as never);

    const result = await reloadContextWeights('/fake/nan.json');

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('schema-mismatch');
  });

  it('rejects Infinity in weights array', async () => {
    // JSON.stringify converts Infinity → null, so we patch the raw string
    const raw = '{"version":"v1","featureOrder":["a","b"],"weights":[1e999,0.5],"bias":0,"metrics":{"samples":1,"syntheticNegatives":0,"heldOutAuc":0.5,"trainedAt":"2026-01-01T00:00:00Z","belowMinSamples":false,"classBalance":{"pos":1,"neg":0}}}';
    mockReadFile.mockResolvedValueOnce(raw as never);

    const result = await reloadContextWeights('/fake/inf.json');

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('schema-mismatch');
  });

  it('rejects empty version string', async () => {
    const bad = makeWeights({ version: '' });
    mockReadFile.mockResolvedValueOnce(JSON.stringify(bad) as never);

    const result = await reloadContextWeights('/fake/empty-version.json');

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('schema-mismatch');
  });

  it('preserves previous weights when reload fails', async () => {
    // First load succeeds
    const v1 = makeWeights({ version: 'v1' });
    mockReadFile.mockResolvedValueOnce(JSON.stringify(v1) as never);
    await reloadContextWeights('/fake/v1.json');
    expect(getActiveWeights().version).toBe('v1');

    // Second load fails — v1 should be preserved
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT') as never);
    await reloadContextWeights('/fake/missing.json');
    expect(getActiveWeights().version).toBe('v1');
  });

  it('BUNDLED_CONTEXT_WEIGHTS is the initial active value before any reload', () => {
    // resetForTests() called in beforeEach — confirm bundled is active
    expect(getActiveWeights()).toBe(BUNDLED_CONTEXT_WEIGHTS);
    expect(getActiveWeights().version).toBe('bundled-1');
  });
});

// ── resetForTests() ────────────────────────────────────────────────────────────

describe('resetForTests()', () => {
  it('restores active weights to BUNDLED_CONTEXT_WEIGHTS', async () => {
    const newWeights = makeWeights({ version: 'to-be-reset' });
    mockReadFile.mockResolvedValueOnce(JSON.stringify(newWeights) as never);
    await reloadContextWeights('/fake/weights.json');
    expect(getActiveWeights().version).toBe('to-be-reset');

    resetForTests();
    expect(getActiveWeights()).toBe(BUNDLED_CONTEXT_WEIGHTS);
  });

  it('clears warn-once set so missing-feature warnings fire again after reset', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const w = makeWeights({ featureOrder: ['resetFeat'], weights: [1.0], bias: 0 });

    score({}, w); // triggers warn for 'resetFeat'
    resetForTests();
    score({}, w); // should warn again after reset

    const calls = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('resetFeat'),
    );
    expect(calls.length).toBe(2);
    warnSpy.mockRestore();
  });
});
