/**
 * stalenessMatrixData.test.ts — smoke tests for the curated staleness data.
 */

import { describe, expect, it } from 'vitest';

import {
  CURATED_STALE_PREFIXES,
  CURATED_STALENESS_ENTRIES,
  TRAINING_CUTOFF_DATE,
} from './stalenessMatrixData';

describe('TRAINING_CUTOFF_DATE', () => {
  it('is a valid ISO 8601 date string', () => {
    expect(typeof TRAINING_CUTOFF_DATE).toBe('string');
    const d = new Date(TRAINING_CUTOFF_DATE);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it('is set to 2025-06-01 baseline', () => {
    expect(TRAINING_CUTOFF_DATE).toBe('2025-06-01');
  });
});

describe('CURATED_STALENESS_ENTRIES', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(CURATED_STALENESS_ENTRIES)).toBe(true);
    expect(CURATED_STALENESS_ENTRIES.length).toBeGreaterThan(0);
  });

  it('has at least 20 curated entries (seeded top-30)', () => {
    expect(CURATED_STALENESS_ENTRIES.length).toBeGreaterThanOrEqual(20);
  });

  it('all entries have kind:"curated"', () => {
    for (const entry of CURATED_STALENESS_ENTRIES) {
      expect(entry.kind).toBe('curated');
    }
  });

  it('all entries have confidence:"high"', () => {
    for (const entry of CURATED_STALENESS_ENTRIES) {
      if (entry.kind === 'curated') {
        expect(entry.confidence).toBe('high');
      }
    }
  });

  it('all entries have non-empty library, cutoffVersion, cutoffDate', () => {
    for (const entry of CURATED_STALENESS_ENTRIES) {
      expect(entry.library.length).toBeGreaterThan(0);
      if (entry.kind === 'curated') {
        expect(entry.cutoffVersion.length).toBeGreaterThan(0);
        expect(entry.cutoffDate.length).toBeGreaterThan(0);
      }
    }
  });

  it('cutoffDates are valid ISO 8601 strings', () => {
    for (const entry of CURATED_STALENESS_ENTRIES) {
      if (entry.kind === 'curated') {
        const d = new Date(entry.cutoffDate);
        expect(isNaN(d.getTime())).toBe(false);
      }
    }
  });

  it('cutoffDates are all before TRAINING_CUTOFF_DATE', () => {
    const cutoff = new Date(TRAINING_CUTOFF_DATE);
    for (const entry of CURATED_STALENESS_ENTRIES) {
      if (entry.kind === 'curated') {
        const d = new Date(entry.cutoffDate);
        expect(d.getTime()).toBeLessThanOrEqual(cutoff.getTime());
      }
    }
  });

  it('contains key ecosystem libraries', () => {
    const libs = new Set(CURATED_STALENESS_ENTRIES.map((e) => e.library));
    expect(libs.has('next')).toBe(true);
    expect(libs.has('react')).toBe(true);
    expect(libs.has('ai')).toBe(true);
    expect(libs.has('tailwindcss')).toBe(true);
    expect(libs.has('zod')).toBe(true);
    expect(libs.has('electron')).toBe(true);
    expect(libs.has('vite')).toBe(true);
  });

  it('has no duplicate library names', () => {
    const names = CURATED_STALENESS_ENTRIES.map((e) => e.library);
    const set = new Set(names);
    expect(set.size).toBe(names.length);
  });
});

describe('CURATED_STALE_PREFIXES', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(CURATED_STALE_PREFIXES)).toBe(true);
    expect(CURATED_STALE_PREFIXES.length).toBeGreaterThan(0);
  });

  it('contains the Radix and Deno prefixes', () => {
    expect(CURATED_STALE_PREFIXES).toContain('@radix-ui/react-');
    expect(CURATED_STALE_PREFIXES).toContain('@deno/');
  });

  it('all prefixes are non-empty strings', () => {
    for (const prefix of CURATED_STALE_PREFIXES) {
      expect(typeof prefix).toBe('string');
      expect(prefix.length).toBeGreaterThan(0);
    }
  });
});
