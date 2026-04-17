/**
 * correctionLibraries.test.ts — Smoke tests for the curated library list.
 * Wave 29.5 Phase H (H4).
 */

import { describe, expect, it } from 'vitest';

import { CURATED_LIBRARIES } from './correctionLibraries';

describe('CURATED_LIBRARIES', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(CURATED_LIBRARIES)).toBe(true);
    expect(CURATED_LIBRARIES.length).toBeGreaterThan(0);
  });

  it('contains key project dependencies in canonical form', () => {
    expect(CURATED_LIBRARIES).toContain('React');
    expect(CURATED_LIBRARIES).toContain('TypeScript');
    expect(CURATED_LIBRARIES).toContain('Vite');
    expect(CURATED_LIBRARIES).toContain('Electron');
    expect(CURATED_LIBRARIES).toContain('Zustand');
  });

  it('contains popular ecosystem libraries used in corrections', () => {
    expect(CURATED_LIBRARIES).toContain('Zod');
    expect(CURATED_LIBRARIES).toContain('Next.js');
    expect(CURATED_LIBRARIES).toContain('Prisma');
    expect(CURATED_LIBRARIES).toContain('Redux');
  });

  it('has no duplicate entries', () => {
    const lower = CURATED_LIBRARIES.map((l) => l.toLowerCase());
    const unique = new Set(lower);
    expect(unique.size).toBe(lower.length);
  });

  it('has no empty strings', () => {
    for (const lib of CURATED_LIBRARIES) {
      expect(lib.trim().length).toBeGreaterThan(0);
    }
  });

  it('has at least 50 entries covering project + popular libs', () => {
    expect(CURATED_LIBRARIES.length).toBeGreaterThanOrEqual(50);
  });
});
