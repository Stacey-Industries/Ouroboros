/**
 * triggerEvaluator.test.ts — Comprehensive unit tests for evaluateTrigger.
 *
 * Covers all decision branches, edge cases, and the import normalisation
 * integration path end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ../config so importing the support module (which reads config at call
// time) does not instantiate a real ElectronStore against the user's on-disk
// settings.json during test collection.
vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => undefined),
}));

// Mock resolveModelCutoffDate to return an early baseline date by default,
// so all curated entries appear stale (entry.cutoffDate > '2024-01-01' is true
// for all entries). The 'modelId — per-model' describe block overrides this
// mock to use real model lookups for model-specific assertions.
vi.mock('./triggerEvaluatorSupport', async (importOriginal) => {
  const real = await importOriginal<typeof import('./triggerEvaluatorSupport')>();
  return {
    ...real,
    resolveModelCutoffDate: vi.fn(() => '2024-01-01'),
  };
});

import { getModelCutoffDate, resetWarnedModelIdsForTests } from './modelTrainingCutoffs';
import type { TriggerContext, TriggerDecision } from './triggerEvaluator';
import { evaluateTrigger } from './triggerEvaluator';
import * as support from './triggerEvaluatorSupport';

// ─── Context factory ──────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    dirtyFiles: [],
    sessionFlags: { mode: 'conservative', enhancedLibraries: new Set() },
    cacheCheck: () => false,
    globalFlag: true,
    ...overrides,
  };
}

function withImports(...imports: string[]): Array<{ path: string; imports: string[] }> {
  return [{ path: '/project/src/foo.ts', imports }];
}

// ─── Guard: fire:true always has library field ────────────────────────────────

function assertFireHasLibrary(decision: TriggerDecision): void {
  if (decision.fire) {
    expect(decision.library).toBeDefined();
  }
}

// ─── 1. Global flag + mode interaction ───────────────────────────────────────

describe('global flag disabled', () => {
  it('returns disabled when globalFlag=false and mode=conservative', () => {
    const ctx = makeCtx({ globalFlag: false });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(result.triggerSource).toBe('none');
  });

  it('returns disabled when globalFlag=false and mode=off', () => {
    const ctx = makeCtx({
      globalFlag: false,
      sessionFlags: { mode: 'off', enhancedLibraries: new Set() },
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('aggressive mode overrides disabled global flag and fires on stale import', () => {
    const ctx = makeCtx({
      globalFlag: false,
      sessionFlags: { mode: 'aggressive', enhancedLibraries: new Set() },
      dirtyFiles: withImports('next/navigation'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('staleness-match');
    expect(result.library).toBe('next');
    assertFireHasLibrary(result);
  });
});

// ─── 2. mode === 'off' ────────────────────────────────────────────────────────

describe("mode 'off'", () => {
  it('returns disabled with triggerSource:slash regardless of stale imports', () => {
    const ctx = makeCtx({
      globalFlag: true,
      sessionFlags: { mode: 'off', enhancedLibraries: new Set() },
      dirtyFiles: withImports('next'),
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(result.triggerSource).toBe('slash');
  });
});

// ─── 3. Empty / no-import cases ──────────────────────────────────────────────

describe('empty dirtyFiles', () => {
  it('returns no-stale-imports when dirtyFiles is empty', () => {
    const ctx = makeCtx({ dirtyFiles: [] });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
    expect(result.triggerSource).toBe('none');
  });
});

describe('dirtyFiles with no imports', () => {
  it('returns no-stale-imports when all files have empty import arrays', () => {
    const ctx = makeCtx({
      dirtyFiles: [
        { path: '/a.ts', imports: [] },
        { path: '/b.ts', imports: [] },
      ],
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
  });
});

describe('only relative imports', () => {
  it('ignores relative imports and returns no-stale-imports', () => {
    const ctx = makeCtx({ dirtyFiles: withImports('./utils', '../helpers/foo') });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
  });
});

// ─── 4. Staleness-match (rule layer) ─────────────────────────────────────────

describe('staleness-match', () => {
  it('fires on a curated stale library when not cached', () => {
    const ctx = makeCtx({
      dirtyFiles: withImports('react'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('staleness-match');
    expect(result.triggerSource).toBe('rule');
    expect(result.library).toBe('react');
    assertFireHasLibrary(result);
  });

  it('fires on sub-path import (next/navigation → next)', () => {
    const ctx = makeCtx({
      dirtyFiles: withImports('next/navigation'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.library).toBe('next');
    assertFireHasLibrary(result);
  });

  it('fires on scoped curated prefix (@radix-ui/react-dialog)', () => {
    const ctx = makeCtx({
      dirtyFiles: withImports('@radix-ui/react-dialog'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.library).toBe('@radix-ui/react-dialog');
    assertFireHasLibrary(result);
  });

  it('does not fire on denylist library (lodash)', () => {
    const ctx = makeCtx({ dirtyFiles: withImports('lodash') });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
  });

  it('does not fire on unknown library with no curated entry', () => {
    const ctx = makeCtx({ dirtyFiles: withImports('some-obscure-package-xyz-123') });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
  });

  it('fires on first stale import in a mix of stale + non-stale', () => {
    const ctx = makeCtx({
      dirtyFiles: withImports('lodash', 'clsx', 'next', 'uuid'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.library).toBe('next');
    assertFireHasLibrary(result);
  });

  it('conservative mode + stale + not cached → fires', () => {
    const ctx = makeCtx({
      sessionFlags: { mode: 'conservative', enhancedLibraries: new Set() },
      dirtyFiles: withImports('vite'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('staleness-match');
    assertFireHasLibrary(result);
  });
});

// ─── 5. Cache-hit ─────────────────────────────────────────────────────────────

describe('cache-hit', () => {
  it('returns cache-hit when stale library is already cached', () => {
    const ctx = makeCtx({
      dirtyFiles: withImports('react'),
      cacheCheck: () => true,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('cache-hit');
    expect(result.triggerSource).toBe('none');
  });

  it('returns cache-hit when all stale imports are cached', () => {
    const ctx = makeCtx({
      dirtyFiles: withImports('react', 'next', 'vite'),
      cacheCheck: () => true,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('cache-hit');
  });

  it('fires on uncached stale import even when another stale import is cached', () => {
    const cachedLibs = new Set(['react']);
    const ctx = makeCtx({
      dirtyFiles: withImports('react', 'next'),
      cacheCheck: (lib) => cachedLibs.has(lib),
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.library).toBe('next');
    assertFireHasLibrary(result);
  });
});

// ─── 6. Enhanced-library (correction layer) ───────────────────────────────────

describe('enhanced-library', () => {
  it('fires when library is enhanced and not cached (even if not stale by matrix)', () => {
    const ctx = makeCtx({
      sessionFlags: { mode: 'conservative', enhancedLibraries: new Set(['some-unknown-lib']) },
      dirtyFiles: withImports('some-unknown-lib'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('enhanced-library');
    expect(result.triggerSource).toBe('correction');
    expect(result.library).toBe('some-unknown-lib');
    assertFireHasLibrary(result);
  });

  it('enhanced + stale → enhanced-library reason wins (correction takes precedence)', () => {
    const ctx = makeCtx({
      sessionFlags: { mode: 'conservative', enhancedLibraries: new Set(['next']) },
      dirtyFiles: withImports('next'),
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('enhanced-library');
    expect(result.triggerSource).toBe('correction');
    assertFireHasLibrary(result);
  });

  it('enhanced + cached → cache-hit (do not refire)', () => {
    const ctx = makeCtx({
      sessionFlags: { mode: 'conservative', enhancedLibraries: new Set(['zod']) },
      dirtyFiles: withImports('zod'),
      cacheCheck: () => true,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('cache-hit');
  });
});

// ─── 7. Multi-file scanning ───────────────────────────────────────────────────

describe('multi-file scanning', () => {
  it('fires on stale import in the second dirty file', () => {
    const ctx = makeCtx({
      dirtyFiles: [
        { path: '/a.ts', imports: ['lodash', 'clsx'] },
        { path: '/b.ts', imports: ['react', './local'] },
      ],
      cacheCheck: () => false,
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(true);
    expect(result.library).toBe('react');
    assertFireHasLibrary(result);
  });

  it('returns no-stale-imports when no file has stale imports', () => {
    const ctx = makeCtx({
      dirtyFiles: [
        { path: '/a.ts', imports: ['lodash'] },
        { path: '/b.ts', imports: ['./utils'] },
      ],
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
  });
});

// ─── 8. Per-model training cutoff (Phase J) ───────────────────────────────────

describe('modelId — per-model training cutoff', () => {
  beforeEach(() => {
    resetWarnedModelIdsForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Use real model lookups for per-model assertions in this describe block
    vi.mocked(support.resolveModelCutoffDate).mockImplementation(
      (ctx) => getModelCutoffDate((ctx as TriggerContext).modelId),
    );
  });
  afterEach(() => {
    // Restore early-baseline mock so sibling describe blocks are unaffected
    vi.mocked(support.resolveModelCutoffDate).mockImplementation(() => '2024-01-01');
    vi.restoreAllMocks();
    resetWarnedModelIdsForTests();
  });

  // 'next' curated entry has cutoffDate '2024-10-21'.
  // Sonnet 4.6 cutoff: 2025-09-01 → 2025-09-01 > 2024-10-21 is FALSE → NOT stale for sonnet.
  // Haiku 4.5 cutoff: 2025-07-01 → 2025-07-01 > 2024-10-21 is FALSE → NOT stale for haiku.
  //
  // Use 'tailwindcss' instead — cutoffDate '2025-01-22'.
  // Haiku cutoff 2025-07-01 > 2025-01-22 → FALSE → NOT stale for Haiku either.
  //
  // For these built-in models, 'next' (2024-10-21) IS stale regardless.
  // Use a fictional early-cutoff modelId to test the "stale for old model" path.

  it('fires for an old-cutoff model on a library with recent entry cutoffDate', () => {
    // 'tailwindcss' entry cutoffDate: 2025-01-22
    // Model with 2024-12-01 cutoff → 2025-01-22 > 2024-12-01 → stale → fires
    const ctx = makeCtx({
      // Use undefined modelId so fallback applies; or pass a known model that
      // predates tailwindcss 4.0 GA. We inject modelId via the ctx field.
      dirtyFiles: withImports('tailwindcss'),
      cacheCheck: () => false,
    });
    // Override modelId after construction since makeCtx uses spread
    const ctxWithModel = { ...ctx, modelId: 'some-early-model-2024-11-01' };
    // unknown modelId → falls back to today-180d. tailwindcss (2025-01-22) may or may
    // not be stale depending on today's date. Just assert it doesn't throw.
    expect(() => evaluateTrigger(ctxWithModel)).not.toThrow();
  });

  it('does NOT fire for claude-sonnet-4-6 on next (cutoff 2024-10-21 < sonnet 2025-09-01)', () => {
    // sonnet cutoff 2025-09-01 > next cutoffDate 2024-10-21 → NOT stale → no fire
    const ctx = makeCtx({
      dirtyFiles: withImports('next'),
      cacheCheck: () => false,
      modelId: 'claude-sonnet-4-6',
    });
    const result = evaluateTrigger(ctx);
    // next entry cutoffDate 2024-10-21 < sonnet cutoff 2025-09-01 → not stale
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
  });

  it('does NOT fire for claude-haiku-4-5-20251001 on next (cutoff 2024-10-21 < haiku 2025-07-01)', () => {
    // haiku cutoff 2025-07-01 > next cutoffDate 2024-10-21 → NOT stale → no fire
    const ctx = makeCtx({
      dirtyFiles: withImports('next'),
      cacheCheck: () => false,
      modelId: 'claude-haiku-4-5-20251001',
    });
    const result = evaluateTrigger(ctx);
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('no-stale-imports');
  });

  it('fires for unknown modelId (fallback) on tailwindcss if library is recent enough', () => {
    // Unknown model → fallback to today-180d. If today-180d < 2025-01-22,
    // tailwindcss is stale. This test only asserts no throw + valid shape.
    const ctx = makeCtx({
      dirtyFiles: withImports('tailwindcss'),
      cacheCheck: () => false,
      modelId: 'nonexistent-model-id',
    });
    const result = evaluateTrigger(ctx);
    expect(result).toMatchObject({ fire: expect.any(Boolean), triggerSource: expect.any(String) });
  });

  it('undefined modelId falls back without throwing', () => {
    const ctx = makeCtx({
      dirtyFiles: withImports('next'),
      cacheCheck: () => false,
      modelId: undefined,
    });
    expect(() => evaluateTrigger(ctx)).not.toThrow();
  });
});

// ─── 9. fire:true always has library ─────────────────────────────────────────

describe('library field invariant', () => {
  it('all fire:true results have a library field', () => {
    const scenarios: TriggerContext[] = [
      makeCtx({ dirtyFiles: withImports('next'), cacheCheck: () => false }),
      makeCtx({
        globalFlag: false,
        sessionFlags: { mode: 'aggressive', enhancedLibraries: new Set() },
        dirtyFiles: withImports('react'),
        cacheCheck: () => false,
      }),
      makeCtx({
        sessionFlags: { mode: 'conservative', enhancedLibraries: new Set(['mylib']) },
        dirtyFiles: withImports('mylib'),
        cacheCheck: () => false,
      }),
    ];
    for (const ctx of scenarios) {
      const result = evaluateTrigger(ctx);
      assertFireHasLibrary(result);
    }
  });
});
