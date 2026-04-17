/**
 * contextRankerDashboardHandlers.test.ts — Unit tests for the context ranker
 * dashboard aggregator (Wave 31 Phase F).
 *
 * Tests cover:
 *   - Bundled weights → auc is null, version = 'bundled-1'
 *   - Trained weights → auc is exposed, version is ISO string
 *   - topFeatures is sorted by |weight| descending, capped at 5
 *   - Zero heldOutAuc on real weights → auc is null
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

// Mutable state for the mock classifier
let mockWeights: import('../orchestration/contextClassifier').ContextRankerWeights = {
  version: 'bundled-1',
  featureOrder: [
    'recencyScore',
    'pagerankScore',
    'importDistance',
    'keywordOverlap',
    'prevUsedCount',
    'toolKindHint_read',
    'toolKindHint_edit',
    'toolKindHint_write',
    'toolKindHint_other',
  ],
  weights: [0.7, 0.9, -0.8, 0.6, 0.5, 0.1, 0.3, 0.4, 0.0],
  bias: -0.5,
  metrics: {
    samples: 0,
    syntheticNegatives: 0,
    heldOutAuc: 0,
    trainedAt: '1970-01-01T00:00:00Z',
    belowMinSamples: true,
    classBalance: { pos: 0, neg: 0 },
  },
};

vi.mock('../orchestration/contextClassifier', () => ({
  getActiveWeights: () => mockWeights,
}));

// ─── Import under test ────────────────────────────────────────────────────────

let getRankerDashboard: typeof import('./contextRankerDashboardHandlers').getRankerDashboard;

beforeEach(async () => {
  vi.resetModules();
  vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  }));
  vi.mock('../orchestration/contextClassifier', () => ({
    getActiveWeights: () => mockWeights,
  }));
  const mod = await import('./contextRankerDashboardHandlers');
  getRankerDashboard = mod.getRankerDashboard;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getRankerDashboard — bundled weights', () => {
  it('returns auc=null for bundled-1 version', () => {
    const d = getRankerDashboard();
    expect(d.version).toBe('bundled-1');
    expect(d.auc).toBeNull();
  });

  it('returns trainedAt from metrics', () => {
    const d = getRankerDashboard();
    expect(d.trainedAt).toBe('1970-01-01T00:00:00Z');
  });

  it('returns exactly 5 topFeatures', () => {
    const d = getRankerDashboard();
    expect(d.topFeatures).toHaveLength(5);
  });

  it('topFeatures sorted by |weight| descending', () => {
    const d = getRankerDashboard();
    const absMags = d.topFeatures.map((f) => Math.abs(f.weight));
    for (let i = 1; i < absMags.length; i++) {
      // eslint-disable-next-line security/detect-object-injection -- i is a numeric loop counter bounded by array length
      expect(absMags[i - 1]).toBeGreaterThanOrEqual(absMags[i]);
    }
  });

  it('topFeatures contain name and weight fields', () => {
    const d = getRankerDashboard();
    for (const f of d.topFeatures) {
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
      expect(typeof f.weight).toBe('number');
      expect(Number.isFinite(f.weight)).toBe(true);
    }
  });
});

describe('getRankerDashboard — trained weights', () => {
  beforeEach(() => {
    mockWeights = {
      version: '2024-01-15T10:00:00.000Z',
      featureOrder: ['recencyScore', 'pagerankScore', 'importDistance'],
      weights: [1.2, 0.3, -0.9],
      bias: 0.1,
      metrics: {
        samples: 1500,
        syntheticNegatives: 200,
        heldOutAuc: 0.82,
        trainedAt: '2024-01-15T10:00:00.000Z',
        belowMinSamples: false,
        classBalance: { pos: 750, neg: 950 },
      },
    };
  });

  it('exposes heldOutAuc when > 0 and not bundled', () => {
    const d = getRankerDashboard();
    expect(d.auc).toBeCloseTo(0.82);
  });

  it('returns the correct version string', () => {
    const d = getRankerDashboard();
    expect(d.version).toBe('2024-01-15T10:00:00.000Z');
  });

  it('caps topFeatures at 5 even with fewer features', () => {
    const d = getRankerDashboard();
    expect(d.topFeatures.length).toBeLessThanOrEqual(5);
    expect(d.topFeatures.length).toBe(3);
  });

  it('first topFeature has highest |weight|', () => {
    const d = getRankerDashboard();
    // weights: [1.2, 0.3, -0.9] → sorted |w| desc: 1.2, 0.9, 0.3
    expect(Math.abs(d.topFeatures[0].weight)).toBeCloseTo(1.2);
    expect(d.topFeatures[0].name).toBe('recencyScore');
  });
});

describe('getRankerDashboard — zero AUC on non-bundled weights', () => {
  beforeEach(() => {
    mockWeights = {
      version: '2024-02-01T00:00:00.000Z',
      featureOrder: ['recencyScore'],
      weights: [0.5],
      bias: 0,
      metrics: {
        samples: 100,
        syntheticNegatives: 10,
        heldOutAuc: 0,  // zero → should be null
        trainedAt: '2024-02-01T00:00:00.000Z',
        belowMinSamples: false,
        classBalance: { pos: 50, neg: 60 },
      },
    };
  });

  it('returns auc=null when heldOutAuc is 0', () => {
    const d = getRankerDashboard();
    expect(d.auc).toBeNull();
  });
});
