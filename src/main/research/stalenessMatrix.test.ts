/**
 * stalenessMatrix.test.ts — unit tests for the staleness matrix lookup API.
 */

import { describe, expect, it } from 'vitest';

import { getAllCuratedLibraries, isStale } from './stalenessMatrix';

// ─── isStale — curated hits ───────────────────────────────────────────────────

describe('isStale — curated library match', () => {
  it('flags next as stale with curated-match reason', () => {
    const result = isStale('next');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
    expect(result.entry?.kind).toBe('curated');
    expect(result.entry?.library).toBe('next');
  });

  it('flags react as stale', () => {
    const result = isStale('react');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags zod as stale', () => {
    const result = isStale('zod');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags tailwindcss as stale', () => {
    const result = isStale('tailwindcss');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags electron as stale', () => {
    const result = isStale('electron');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags vite as stale', () => {
    const result = isStale('vite');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags ai (Vercel AI SDK) as stale', () => {
    const result = isStale('ai');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags @trpc/server as stale', () => {
    const result = isStale('@trpc/server');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags @tanstack/react-query as stale', () => {
    const result = isStale('@tanstack/react-query');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('returns the curated entry with cutoffVersion and cutoffDate fields', () => {
    const result = isStale('next');
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
  it('flags @radix-ui/react-dialog as stale via prefix', () => {
    const result = isStale('@radix-ui/react-dialog');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
    expect(result.entry?.kind).toBe('curated');
  });

  it('flags @radix-ui/react-dropdown-menu as stale via prefix', () => {
    const result = isStale('@radix-ui/react-dropdown-menu');
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('curated-match');
  });

  it('flags @deno/std as stale via prefix', () => {
    const result = isStale('@deno/std');
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
