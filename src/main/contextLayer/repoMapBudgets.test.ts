/**
 * repoMapBudgets.test.ts — Wave 69 Phase C unit tests for getRepoMapBudget.
 * Acceptance: known models return their tier; unknown / missing falls back to
 * the historical 8 KB / 2K default so callers without `model:` don't regress.
 */

import { describe, expect, it } from 'vitest';

import { getRepoMapBudget } from './repoMapBudgets';

describe('getRepoMapBudget', () => {
  it('returns the Opus tier for opus model ids', () => {
    expect(getRepoMapBudget('claude-opus-4-7')).toEqual({
      rawCapBytes: 16384,
      injectionTokenCap: 4000,
    });
  });

  it('returns the Opus tier even when the model id has a date suffix', () => {
    expect(getRepoMapBudget('claude-opus-4-7-20260115')).toEqual({
      rawCapBytes: 16384,
      injectionTokenCap: 4000,
    });
  });

  it('returns the Sonnet tier for sonnet model ids', () => {
    expect(getRepoMapBudget('claude-sonnet-4-6')).toEqual({
      rawCapBytes: 12288,
      injectionTokenCap: 3000,
    });
  });

  it('falls through to the default tier for unknown models', () => {
    expect(getRepoMapBudget('claude-haiku-4-5')).toEqual({
      rawCapBytes: 8192,
      injectionTokenCap: 2000,
    });
    expect(getRepoMapBudget('gpt-5')).toEqual({
      rawCapBytes: 8192,
      injectionTokenCap: 2000,
    });
  });

  it('falls through to the default tier when model is undefined', () => {
    expect(getRepoMapBudget(undefined)).toEqual({
      rawCapBytes: 8192,
      injectionTokenCap: 2000,
    });
  });

  it('falls through to the default tier when model is null', () => {
    expect(getRepoMapBudget(null)).toEqual({
      rawCapBytes: 8192,
      injectionTokenCap: 2000,
    });
  });

  it('falls through to the default tier when model is empty string', () => {
    expect(getRepoMapBudget('')).toEqual({
      rawCapBytes: 8192,
      injectionTokenCap: 2000,
    });
  });

  it('is case-insensitive on the model id', () => {
    expect(getRepoMapBudget('CLAUDE-OPUS-4-7')).toEqual({
      rawCapBytes: 16384,
      injectionTokenCap: 4000,
    });
  });
});
