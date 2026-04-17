/**
 * triggerEvaluator.test.ts — Comprehensive unit tests for evaluateTrigger.
 *
 * Covers all decision branches, edge cases, and the import normalisation
 * integration path end-to-end.
 */

import { describe, expect, it } from 'vitest';

import type { TriggerContext, TriggerDecision } from './triggerEvaluator';
import { evaluateTrigger } from './triggerEvaluator';

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

// ─── 8. fire:true always has library ─────────────────────────────────────────

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
