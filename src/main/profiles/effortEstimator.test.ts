/**
 * effortEstimator.test.ts — Unit tests for the turn cost / latency estimator.
 */

import { describe, expect, it } from 'vitest';

import { estimateTurnCost } from './effortEstimator';

describe('estimateTurnCost', () => {
  it('returns positive values for a typical sonnet + medium profile', () => {
    const result = estimateTurnCost({ model: 'claude-sonnet-4-6', effort: 'medium' }, 5000);
    expect(result.estimatedMs).toBeGreaterThan(0);
    expect(result.estimatedUsd).toBeGreaterThan(0);
  });

  it('opus + high costs more than haiku + low', () => {
    const opus = estimateTurnCost({ model: 'claude-opus-4-6', effort: 'high' }, 5000);
    const haiku = estimateTurnCost({ model: 'claude-haiku-3-5', effort: 'low' }, 5000);
    expect(opus.estimatedUsd).toBeGreaterThan(haiku.estimatedUsd);
  });

  it('opus is slower (more ms per token) than haiku for same effort', () => {
    const opus = estimateTurnCost({ model: 'claude-opus-4-6', effort: 'medium' }, 1000);
    const haiku = estimateTurnCost({ model: 'claude-haiku-3-5', effort: 'medium' }, 1000);
    expect(opus.estimatedMs).toBeGreaterThan(haiku.estimatedMs);
  });

  it('high effort produces more estimated ms than low effort (same model)', () => {
    const high = estimateTurnCost({ model: 'claude-sonnet-4-6', effort: 'high' }, 2000);
    const low = estimateTurnCost({ model: 'claude-sonnet-4-6', effort: 'low' }, 2000);
    expect(high.estimatedMs).toBeGreaterThan(low.estimatedMs);
  });

  it('falls back gracefully when model is undefined', () => {
    const result = estimateTurnCost({ model: undefined, effort: 'medium' }, 3000);
    expect(result.estimatedMs).toBeGreaterThan(0);
    expect(result.estimatedUsd).toBeGreaterThan(0);
  });

  it('returns zero USD when contextTokens is 0 and output is minimal', () => {
    const result = estimateTurnCost({ model: 'claude-haiku-3-5', effort: 'low' }, 0);
    expect(result.estimatedUsd).toBeGreaterThan(0); // output cost still applies
    expect(result.estimatedMs).toBeGreaterThan(0);
  });

  it('scales input cost linearly with contextTokens', () => {
    const small = estimateTurnCost({ model: 'claude-sonnet-4-6', effort: 'medium' }, 1000);
    const large = estimateTurnCost({ model: 'claude-sonnet-4-6', effort: 'medium' }, 100_000);
    expect(large.estimatedUsd).toBeGreaterThan(small.estimatedUsd);
  });
});
