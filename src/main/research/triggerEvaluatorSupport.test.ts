/**
 * triggerEvaluatorSupport.test.ts — Unit tests for support helpers.
 *
 * Covers normalizeImportToLibrary, evaluateCorrectionLayer, and evaluateRuleLayer.
 */

import { describe, expect, it } from 'vitest';

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
    const ctx = makeCtx();
    // 'lodash' is on the denylist → not stale
    expect(evaluateRuleLayer('lodash', ctx)).toBeUndefined();
  });

  it('fires for stale library not in cache', () => {
    const ctx = makeCtx({ cacheCheck: () => false });
    // 'next' is a curated stale library
    const result = evaluateRuleLayer('next', ctx);
    expect(result?.fire).toBe(true);
    expect(result?.reason).toBe('staleness-match');
    expect(result?.triggerSource).toBe('rule');
    expect(result?.library).toBe('next');
  });

  it('returns cache-hit for stale library already cached', () => {
    const ctx = makeCtx({ cacheCheck: () => true });
    const result = evaluateRuleLayer('react', ctx);
    expect(result?.fire).toBe(false);
    expect(result?.reason).toBe('cache-hit');
  });

  it('returns undefined for unknown library (no-data = not stale)', () => {
    const ctx = makeCtx();
    expect(evaluateRuleLayer('some-obscure-package-xyz', ctx)).toBeUndefined();
  });
});
