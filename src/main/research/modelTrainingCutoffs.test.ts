/**
 * modelTrainingCutoffs.test.ts — Unit tests for Wave 30 Phase J.
 *
 * Covers:
 *   - Registry completeness (every BuiltInModelId has an entry)
 *   - Known model lookup returns its cutoff date
 *   - Unknown model falls back to today-180d and logs exactly once per ID
 *   - undefined input also falls back and logs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BuiltInModelId } from './modelTrainingCutoffs';
import {
  getModelCutoffDate,
  MODEL_TRAINING_CUTOFFS,
  resetWarnedModelIdsForTests,
} from './modelTrainingCutoffs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUILT_IN_MODEL_IDS: BuiltInModelId[] = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'opus',
  'sonnet',
  'haiku',
  'MiniMax-M2.7',
  'MiniMax-M2.5',
];

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function todayMinus180dISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

// ─── Registry completeness ────────────────────────────────────────────────────

describe('MODEL_TRAINING_CUTOFFS — registry completeness', () => {
  it('has an entry for every BuiltInModelId', () => {
    for (const id of BUILT_IN_MODEL_IDS) {
      // eslint-disable-next-line security/detect-object-injection -- id is a BuiltInModelId literal, not user input
      expect(MODEL_TRAINING_CUTOFFS[id]).toBeDefined();
    }
  });

  it('every entry has a valid ISO 8601 cutoffDate', () => {
    for (const id of BUILT_IN_MODEL_IDS) {
      // eslint-disable-next-line security/detect-object-injection -- id is a BuiltInModelId literal, not user input
      const entry = MODEL_TRAINING_CUTOFFS[id];
      expect(isIsoDate(entry.cutoffDate)).toBe(true);
    }
  });

  it('every cutoffDate is a plausible year (2024+)', () => {
    for (const id of BUILT_IN_MODEL_IDS) {
      // eslint-disable-next-line security/detect-object-injection -- id is a BuiltInModelId literal, not user input
      const year = parseInt(MODEL_TRAINING_CUTOFFS[id].cutoffDate.slice(0, 4), 10);
      expect(year).toBeGreaterThanOrEqual(2024);
    }
  });
});

// ─── getModelCutoffDate — known models ───────────────────────────────────────

describe('getModelCutoffDate — known model lookup', () => {
  it('returns the correct cutoff for claude-opus-4-6', () => {
    expect(getModelCutoffDate('claude-opus-4-6')).toBe(
      MODEL_TRAINING_CUTOFFS['claude-opus-4-6'].cutoffDate,
    );
  });

  it('returns the correct cutoff for claude-sonnet-4-6', () => {
    expect(getModelCutoffDate('claude-sonnet-4-6')).toBe(
      MODEL_TRAINING_CUTOFFS['claude-sonnet-4-6'].cutoffDate,
    );
  });

  it('returns the correct cutoff for claude-haiku-4-5-20251001', () => {
    expect(getModelCutoffDate('claude-haiku-4-5-20251001')).toBe(
      MODEL_TRAINING_CUTOFFS['claude-haiku-4-5-20251001'].cutoffDate,
    );
  });

  it('returns valid ISO date for all built-in IDs without warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    for (const id of BUILT_IN_MODEL_IDS) {
      const date = getModelCutoffDate(id);
      expect(isIsoDate(date)).toBe(true);
    }
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── getModelCutoffDate — unknown model fallback ──────────────────────────────

describe('getModelCutoffDate — unknown model fallback', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetWarnedModelIdsForTests();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    resetWarnedModelIdsForTests();
  });

  it('returns today-180d (±1 day) for an unknown model ID', () => {
    const result = getModelCutoffDate('unknown-model-xyz');
    const expected = todayMinus180dISO();
    const resultMs = new Date(result).getTime();
    const expectedMs = new Date(expected).getTime();
    // Allow ±1 day tolerance for midnight boundary
    expect(Math.abs(resultMs - expectedMs)).toBeLessThanOrEqual(86_400_000);
  });

  it('logs a console.warn for an unknown model ID', () => {
    getModelCutoffDate('some-unknown-model');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('some-unknown-model');
  });

  it('logs the warning exactly once per unique unknown ID across multiple calls', () => {
    getModelCutoffDate('dupe-model');
    getModelCutoffDate('dupe-model');
    getModelCutoffDate('dupe-model');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('logs once per unique ID (different IDs get separate warnings)', () => {
    getModelCutoffDate('model-a');
    getModelCutoffDate('model-a');
    getModelCutoffDate('model-b');
    getModelCutoffDate('model-b');
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('returns today-180d for undefined input', () => {
    const result = getModelCutoffDate(undefined);
    const expected = todayMinus180dISO();
    const resultMs = new Date(result).getTime();
    const expectedMs = new Date(expected).getTime();
    expect(Math.abs(resultMs - expectedMs)).toBeLessThanOrEqual(86_400_000);
  });

  it('logs a warning for undefined input', () => {
    getModelCutoffDate(undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('undefined input warning is deduplicated across calls', () => {
    getModelCutoffDate(undefined);
    getModelCutoffDate(undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
