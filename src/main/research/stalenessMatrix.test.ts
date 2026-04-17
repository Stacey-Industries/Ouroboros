/**
 * stalenessMatrix.test.ts — unit tests for the staleness matrix lookup API.
 */

import { describe, expect, it } from 'vitest';

import { getAllCuratedLibraries, isStale } from './stalenessMatrix';

// Early model cutoff used in tests that assert stale:true.
// All curated entries have cutoffDate after 2024-01-01, so any entry with
// cutoffDate > EARLY_CUTOFF → stale:true for a model trained before that date.
const EARLY_CUTOFF = '2024-01-01';

// ─── isStale — curated hits ───────────────────────────────────────────────────

describe('isStale — curated library match', () => {
  it('flags next as stale with curated-match reason (early-cutoff model)', () => {
    const result = isStale('next', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
    expect(result.entry?.kind).toBe('curated');
    expect(result.entry?.library).toBe('next');
  });

  it('flags react as stale (early-cutoff model)', () => {
    const result = isStale('react', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags zod as stale (early-cutoff model)', () => {
    const result = isStale('zod', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags tailwindcss as stale (early-cutoff model)', () => {
    const result = isStale('tailwindcss', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags electron as stale (early-cutoff model)', () => {
    const result = isStale('electron', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags vite as stale (early-cutoff model)', () => {
    const result = isStale('vite', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags ai (Vercel AI SDK) as stale (early-cutoff model)', () => {
    const result = isStale('ai', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags @trpc/server as stale (early-cutoff model)', () => {
    const result = isStale('@trpc/server', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags @tanstack/react-query as stale (early-cutoff model)', () => {
    const result = isStale('@tanstack/react-query', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('returns the curated entry with cutoffVersion and cutoffDate fields', () => {
    const result = isStale('next', undefined, EARLY_CUTOFF);
    expect(result.entry).not.toBeNull();
    if (result.entry?.kind === 'curated') {
      expect(typeof result.entry.cutoffVersion).toBe('string');
      expect(result.entry.cutoffVersion.length).toBeGreaterThan(0);
      expect(typeof result.entry.cutoffDate).toBe('string');
      expect(result.entry.cutoffDate.length).toBeGreaterThan(0);
    }
  });
});

// ─── isStale — prefix-based curated hits ─────────────────────────────────────

describe('isStale — curated prefix match', () => {
  it('flags @radix-ui/react-dialog as stale via prefix (early-cutoff model)', () => {
    const result = isStale('@radix-ui/react-dialog', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
    expect(result.entry?.kind).toBe('curated');
  });

  it('flags @radix-ui/react-dropdown-menu as stale via prefix (early-cutoff model)', () => {
    const result = isStale('@radix-ui/react-dropdown-menu', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags @deno/std as stale via prefix (early-cutoff model)', () => {
    const result = isStale('@deno/std', undefined, EARLY_CUTOFF);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });
});

// ─── isStale — denylist ───────────────────────────────────────────────────────

describe('isStale — denylist short-circuit', () => {
  it('returns stale:false for lodash', () => {
    const result = isStale('lodash');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
    expect(result.entry).toBeNull();
  });

  it('returns stale:false for ramda', () => {
    const result = isStale('ramda');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
  });

  it('returns stale:false for date-fns', () => {
    const result = isStale('date-fns');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
  });

  it('returns stale:false for uuid', () => {
    const result = isStale('uuid');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
  });

  it('returns stale:false for clsx', () => {
    const result = isStale('clsx');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
  });

  it('returns stale:false for react-dom (coupled to react)', () => {
    const result = isStale('react-dom');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
  });

  it('returns stale:false for typescript', () => {
    const result = isStale('typescript');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
  });

  it('returns stale:false for internal-scoped packages', () => {
    expect(isStale('@internal/my-lib').reason).toBe('denylist');
    expect(isStale('@local/utils').reason).toBe('denylist');
    expect(isStale('@private/sdk').reason).toBe('denylist');
  });
});

// ─── isStale — unknown library ────────────────────────────────────────────────

describe('isStale — unknown library (no data)', () => {
  it('returns stale:false with reason no-data for an unknown package', () => {
    const result = isStale('some-random-unpublished-package-xyz');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('no-data');
    expect(result.entry).toBeNull();
  });

  it('echoes the library name in the result', () => {
    const result = isStale('my-unknown-lib');
    expect(result.library).toBe('my-unknown-lib');
  });

  it('accepts an optional importedVersion without throwing', () => {
    expect(() => isStale('unknown-lib', '1.2.3')).not.toThrow();
  });
});

// ─── isStale — model-relative cutoff (Phase J) ───────────────────────────────

describe('isStale — modelCutoffDate parameter', () => {
  // 'next' has entry cutoffDate '2024-10-21' in the curated list

  it('flags next as stale for a model with cutoff before entry date', () => {
    // Model cutoff 2024-06-01 < entry cutoffDate 2024-10-21 → stale
    const result = isStale('next', undefined, '2024-06-01');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags next as NOT stale for a model with cutoff after entry date', () => {
    // Model cutoff 2025-09-01 > entry cutoffDate 2024-10-21 → not stale
    const result = isStale('next', undefined, '2025-09-01');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('curated-match');
    expect(result.entry).not.toBeNull();
  });

  it('uses TRAINING_CUTOFF_DATE when modelCutoffDate is omitted (backward compat)', () => {
    // Without the param, existing behaviour should be preserved
    const withParam = isStale('next', undefined, '2025-06-01');
    const withoutParam = isStale('next');
    expect(withParam.stale).toBe(withoutParam.stale);
  });

  it('denylist short-circuits regardless of model cutoff', () => {
    const result = isStale('lodash', undefined, '2020-01-01');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('denylist');
  });

  it('unknown library returns no-data regardless of model cutoff', () => {
    const result = isStale('some-random-pkg-xyz', undefined, '2024-01-01');
    expect(result.stale).toBe(false);
    expect(result.reason).toBe('no-data');
  });

  it('tailwindcss (cutoffDate 2025-01-22) is NOT stale for late-2025 model', () => {
    const result = isStale('tailwindcss', undefined, '2025-09-01');
    expect(result.stale).toBe(false);
  });

  it('tailwindcss (cutoffDate 2025-01-22) IS stale for model with 2024-12-01 cutoff', () => {
    const result = isStale('tailwindcss', undefined, '2024-12-01');
    expect(result.stale).toBe(true);
  });
});

// ─── getAllCuratedLibraries ───────────────────────────────────────────────────

describe('getAllCuratedLibraries', () => {
  it('returns a non-empty readonly array', () => {
    const libs = getAllCuratedLibraries();
    expect(Array.isArray(libs)).toBe(true);
    expect(libs.length).toBeGreaterThan(0);
  });

  it('includes the core curated libraries', () => {
    const libs = getAllCuratedLibraries();
    expect(libs).toContain('next');
    expect(libs).toContain('react');
    expect(libs).toContain('zod');
    expect(libs).toContain('vite');
    expect(libs).toContain('electron');
  });

  it('does not include denylist entries', () => {
    const libs = getAllCuratedLibraries();
    expect(libs).not.toContain('lodash');
    expect(libs).not.toContain('typescript');
    expect(libs).not.toContain('react-dom');
  });

  it('returns strings with no duplicates', () => {
    const libs = getAllCuratedLibraries();
    const set = new Set(libs);
    expect(set.size).toBe(libs.length);
  });
});
