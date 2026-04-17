/**
 * triggerEvaluatorSupport.test.ts — Unit tests for support helpers.
 *
 * Covers normalizeImportToLibrary, evaluateCorrectionLayer, evaluateRuleLayer,
 * and Phase I confidence floor behaviour.
 *
 * isStale is mocked so tests are decoupled from real curated data and
 * model-cutoff date arithmetic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => undefined),
}));

vi.mock('./stalenessMatrix', () => ({
  isStale: vi.fn(),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { getConfigValue } from '../config';
import { isStale } from './stalenessMatrix';
import type { TriggerContext } from './triggerEvaluator';
import {
  evaluateCorrectionLayer,
  evaluateRuleLayer,
  normalizeImportToLibrary,
} from './triggerEvaluatorSupport';

// ─── normalizeImportToLibrary ─────────────────────────────────────────────────

describe('normalizeImportToLibrary', () => {
  it('strips sub-path from bare package', () => {
    expect(normalizeImportToLibrary('next/navigation')).toBe('next');
  });

  it('returns bare package name unchanged', () => {
    expect(normalizeImportToLibrary('react')).toBe('react');
  });

  it('keeps only scope + name for scoped packages', () => {
    expect(normalizeImportToLibrary('@radix-ui/react-dialog')).toBe('@radix-ui/react-dialog');
  });

  it('strips sub-path from scoped package', () => {
    expect(normalizeImportToLibrary('@scope/pkg/sub')).toBe('@scope/pkg');
  });

  it('returns empty string for ./ relative imports', () => {
    expect(normalizeImportToLibrary('./utils')).toBe('');
  });

  it('returns empty string for ../ relative imports', () => {
    expect(normalizeImportToLibrary('../helpers/foo')).toBe('');
  });

  it('handles @tanstack/react-query', () => {
    expect(normalizeImportToLibrary('@tanstack/react-query')).toBe('@tanstack/react-query');
  });
});

// ─── Test context factory ─────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    dirtyFiles: [],
    sessionFlags: { mode: 'conservative', enhancedLibraries: new Set() },
    cacheCheck: () => false,
    globalFlag: true,
    ...overrides,
  };
}

// ─── Staleness mock helpers ───────────────────────────────────────────────────

function mockStale(library: string, confidence: 'high' | 'medium' = 'high'): void {
  vi.mocked(isStale).mockReturnValue({
    library,
    stale: true,
    entry: {
      kind: 'curated',
      library,
      cutoffVersion: '15.0.0',
      cutoffDate: '2024-10-21',
      confidence: confidence as 'high',
    },
    reason: 'curated-match',
  });
}

function mockNotStale(library: string): void {
  vi.mocked(isStale).mockReturnValue({
    library,
    stale: false,
    entry: null,
    reason: 'no-data',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no floor (0.0 — include all), isStale returns not-stale by default
  vi.mocked(getConfigValue).mockReturnValue(undefined);
  mockNotStale('lodash');
});

// ─── evaluateCorrectionLayer ──────────────────────────────────────────────────

describe('evaluateCorrectionLayer', () => {
  it('returns undefined when library is not in enhanced set', () => {
    const ctx = makeCtx();
    expect(evaluateCorrectionLayer('react', ctx)).toBeUndefined();
  });

  it('fires when library is enhanced and not cached', () => {
    const ctx = makeCtx({
      sessionFlags: { mode: 'conservative', enhancedLibraries: new Set(['zod']) },
      cacheCheck: () => false,
    });
    const result = evaluateCorrectionLayer('zod', ctx);
    expect(result?.fire).toBe(true);
    expect(result?.reason).toBe('enhanced-library');
    expect(result?.triggerSource).toBe('correction');
    expect(result?.library).toBe('zod');
  });

  it('returns cache-hit when library is enhanced but already cached', () => {
    const ctx = makeCtx({
      sessionFlags: { mode: 'conservative', enhancedLibraries: new Set(['zod']) },
      cacheCheck: () => true,
    });
    const result = evaluateCorrectionLayer('zod', ctx);
    expect(result?.fire).toBe(false);
    expect(result?.reason).toBe('cache-hit');
  });
});

// ─── evaluateRuleLayer ────────────────────────────────────────────────────────

describe('evaluateRuleLayer', () => {
  it('returns undefined for non-stale library', () => {
    mockNotStale('lodash');
    const ctx = makeCtx();
    expect(evaluateRuleLayer('lodash', ctx)).toBeUndefined();
  });

  it('fires for stale library not in cache', () => {
    mockStale('next', 'high');
    const ctx = makeCtx({ cacheCheck: () => false });
    const result = evaluateRuleLayer('next', ctx);
    expect(result?.fire).toBe(true);
    expect(result?.reason).toBe('staleness-match');
    expect(result?.triggerSource).toBe('rule');
    expect(result?.library).toBe('next');
  });

  it('returns cache-hit for stale library already cached', () => {
    mockStale('react', 'high');
    const ctx = makeCtx({ cacheCheck: () => true });
    const result = evaluateRuleLayer('react', ctx);
    expect(result?.fire).toBe(false);
    expect(result?.reason).toBe('cache-hit');
  });

  it('returns undefined for unknown library (no-data = not stale)', () => {
    mockNotStale('some-obscure-package-xyz');
    const ctx = makeCtx();
    expect(evaluateRuleLayer('some-obscure-package-xyz', ctx)).toBeUndefined();
  });
});

// ─── Phase I: staleness confidence floor ──────────────────────────────────────

describe('evaluateRuleLayer — confidence floor (Phase I)', () => {
  it('floor=0.0 includes high-confidence curated entries (fires)', () => {
    mockStale('next', 'high');
    vi.mocked(getConfigValue).mockReturnValue({ stalenessConfidenceFloor: 0.0 });
    const ctx = makeCtx({ cacheCheck: () => false });
    const result = evaluateRuleLayer('next', ctx);
    expect(result?.fire).toBe(true);
    expect(result?.reason).toBe('staleness-match');
  });

  it('floor=1.0 still fires for high-confidence (1.0 >= 1.0)', () => {
    mockStale('next', 'high');
    vi.mocked(getConfigValue).mockReturnValue({ stalenessConfidenceFloor: 1.0 });
    const ctx = makeCtx({ cacheCheck: () => false });
    const result = evaluateRuleLayer('next', ctx);
    // high=1.0 >= floor=1.0 → passes
    expect(result?.fire).toBe(true);
  });

  it('floor=0.6 excludes medium-confidence (0.5) entries, treating them as not-stale', () => {
    // mock a medium-confidence entry: confidence=0.5, floor=0.6 → 0.5 < 0.6 → not-stale
    vi.mocked(isStale).mockReturnValue({
      library: 'some-lib',
      stale: true,
      entry: {
        kind: 'curated',
        library: 'some-lib',
        cutoffVersion: '1.0.0',
        cutoffDate: '2024-01-01',
        confidence: 'high' as const, // use high but override confidence check via floor logic
      },
      reason: 'curated-match',
    });
    // To test medium exclusion, we need a medium entry. Re-mock with medium confidence:
    vi.mocked(isStale).mockReturnValue({
      library: 'medium-lib',
      stale: true,
      // confidence is 'high' per the StalenessEntry type, but we test the floor with value 0.6
      // which tests medium exclusion. Since StalenessEntry only has 'high' for curated,
      // we cast to test the floor logic path.
      entry: { kind: 'curated', library: 'medium-lib', cutoffVersion: '1.0.0', cutoffDate: '2024-01-01', confidence: 'high' } as never,
      reason: 'curated-match',
    });
    // Actually override the cast to medium for this test
    vi.mocked(isStale).mockReturnValue({
      library: 'medium-lib',
      stale: true,
      entry: { kind: 'heuristic', library: 'medium-lib', releasedAfter: '2024-01-01', confidence: 'medium' },
      reason: 'curated-match',
    });
    vi.mocked(getConfigValue).mockReturnValue({ stalenessConfidenceFloor: 0.6 });
    const ctx = makeCtx({ cacheCheck: () => false });
    // medium (0.5) < floor (0.6) → treated as not-stale → undefined
    const result = evaluateRuleLayer('medium-lib', ctx);
    expect(result).toBeUndefined();
  });

  it('floor=0.0 includes all confidence levels (default behaviour)', () => {
    mockStale('react', 'high');
    vi.mocked(getConfigValue).mockReturnValue({ stalenessConfidenceFloor: 0.0 });
    const ctx = makeCtx({ cacheCheck: () => false });
    const result = evaluateRuleLayer('react', ctx);
    expect(result?.fire).toBe(true);
  });

  it('floor=0.8 still fires for high-confidence (1.0 >= 0.8)', () => {
    mockStale('next', 'high');
    vi.mocked(getConfigValue).mockReturnValue({ stalenessConfidenceFloor: 0.8 });
    const ctx = makeCtx({ cacheCheck: () => false });
    const result = evaluateRuleLayer('next', ctx);
    expect(result?.fire).toBe(true);
  });

  it('config read error falls back to floor=0.0 (fires normally)', () => {
    mockStale('next', 'high');
    vi.mocked(getConfigValue).mockImplementation(() => {
      throw new Error('config read failure');
    });
    const ctx = makeCtx({ cacheCheck: () => false });
    const result = evaluateRuleLayer('next', ctx);
    expect(result?.fire).toBe(true);
  });
});
