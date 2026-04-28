/**
 * rankerHitsSchema.test.ts — Wave 53b Phase B
 *
 * Smoke tests for the ranker-hits schema module. The module is
 * types-only (no runtime logic) — tests verify constant values and
 * that the exported surfaces are stable strings consumers can key on.
 */

import { describe, expect, it } from 'vitest';

import {
  RANKER_HIT_SCHEMA_VERSION,
  RANKER_HIT_SURFACE,
  RANKER_SELECTION_SCHEMA_VERSION,
  RANKER_SELECTION_SURFACE,
} from './rankerHitsSchema';

describe('rankerHitsSchema — surface identifiers', () => {
  it('exports the ranker-selection surface name', () => {
    expect(RANKER_SELECTION_SURFACE).toBe('ranker-selection');
  });

  it('exports the ranker-hit surface name', () => {
    expect(RANKER_HIT_SURFACE).toBe('ranker-hit');
  });
});

describe('rankerHitsSchema — schema versions', () => {
  it('exports RANKER_SELECTION_SCHEMA_VERSION as a positive integer', () => {
    expect(typeof RANKER_SELECTION_SCHEMA_VERSION).toBe('number');
    expect(Number.isInteger(RANKER_SELECTION_SCHEMA_VERSION)).toBe(true);
    expect(RANKER_SELECTION_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it('exports RANKER_HIT_SCHEMA_VERSION as a positive integer', () => {
    expect(typeof RANKER_HIT_SCHEMA_VERSION).toBe('number');
    expect(Number.isInteger(RANKER_HIT_SCHEMA_VERSION)).toBe(true);
    expect(RANKER_HIT_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it('RANKER_SELECTION_SCHEMA_VERSION is currently 1', () => {
    expect(RANKER_SELECTION_SCHEMA_VERSION).toBe(1);
  });

  it('RANKER_HIT_SCHEMA_VERSION is currently 1', () => {
    expect(RANKER_HIT_SCHEMA_VERSION).toBe(1);
  });
});
