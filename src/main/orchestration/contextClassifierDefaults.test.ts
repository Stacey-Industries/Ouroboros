/**
 * contextClassifierDefaults.test.ts — Sanity checks for bundled fallback weights.
 *
 * Guards against accidental edits that would break the shape contract between
 * contextClassifierDefaults.ts and contextClassifier.ts / train-context.py.
 */

import { describe, expect, it } from 'vitest';

import { BUNDLED_CONTEXT_WEIGHTS } from './contextClassifierDefaults';

// Canonical feature names emitted by tools/train-context.py (FEATURE_NAMES constant).
// If train-context.py's schema changes, this list AND the defaults must both update.
const EXPECTED_FEATURE_ORDER = [
  'recencyScore',
  'pagerankScore',
  'importDistance',
  'keywordOverlap',
  'prevUsedCount',
  'toolKindHint_read',
  'toolKindHint_edit',
  'toolKindHint_write',
  'toolKindHint_other',
] as const;

describe('BUNDLED_CONTEXT_WEIGHTS', () => {
  it('has matching featureOrder and weights lengths', () => {
    expect(BUNDLED_CONTEXT_WEIGHTS.weights.length).toBe(
      BUNDLED_CONTEXT_WEIGHTS.featureOrder.length,
    );
  });

  it('featureOrder matches train-context.py FEATURE_NAMES exactly', () => {
    expect(Array.from(BUNDLED_CONTEXT_WEIGHTS.featureOrder)).toEqual(
      Array.from(EXPECTED_FEATURE_ORDER),
    );
  });

  it('all weights are finite numbers', () => {
    for (const w of BUNDLED_CONTEXT_WEIGHTS.weights) {
      expect(Number.isFinite(w)).toBe(true);
    }
  });

  it('bias is a finite number', () => {
    expect(Number.isFinite(BUNDLED_CONTEXT_WEIGHTS.bias)).toBe(true);
  });

  it('version is a non-empty string', () => {
    expect(typeof BUNDLED_CONTEXT_WEIGHTS.version).toBe('string');
    expect(BUNDLED_CONTEXT_WEIGHTS.version.length).toBeGreaterThan(0);
  });

  it('metrics.belowMinSamples is true for bundled weights', () => {
    expect(BUNDLED_CONTEXT_WEIGHTS.metrics.belowMinSamples).toBe(true);
  });

  it('has exactly 9 features (5 numeric + 4 toolKindHint one-hot)', () => {
    expect(BUNDLED_CONTEXT_WEIGHTS.featureOrder.length).toBe(9);
  });
});
