/**
 * factClaimPatterns.test.ts — Smoke tests for the fact-claim pattern data file.
 *
 * Validates: all entries have required fields, patterns are valid RegExp,
 * confidence values are within the allowed set, and library names are non-empty.
 */

import { describe, expect, it } from 'vitest';

import type { FactClaimPattern } from './factClaimPatterns';
import { FACT_CLAIM_PATTERNS } from './factClaimPatterns';

const VALID_CONFIDENCE = new Set<FactClaimPattern['confidence']>(['high', 'medium', 'low']);

describe('FACT_CLAIM_PATTERNS', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(FACT_CLAIM_PATTERNS)).toBe(true);
    expect(FACT_CLAIM_PATTERNS.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty library string', () => {
    for (const p of FACT_CLAIM_PATTERNS) {
      expect(typeof p.library).toBe('string');
      expect(p.library.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a valid RegExp pattern', () => {
    for (const p of FACT_CLAIM_PATTERNS) {
      expect(p.pattern).toBeInstanceOf(RegExp);
    }
  });

  it('every entry has a valid confidence level', () => {
    for (const p of FACT_CLAIM_PATTERNS) {
      expect(VALID_CONFIDENCE.has(p.confidence)).toBe(true);
    }
  });

  it('every entry has a non-empty description', () => {
    for (const p of FACT_CLAIM_PATTERNS) {
      expect(typeof p.description).toBe('string');
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it('react pattern matches hook invocations', () => {
    const react = FACT_CLAIM_PATTERNS.find((p) => p.library === 'react');
    expect(react).toBeDefined();
    expect(react!.pattern.test('useState(')).toBe(true);
    expect(react!.pattern.test('useEffect(')).toBe(true);
    expect(react!.pattern.test('useCustomHook(')).toBe(true);
  });

  it('zod pattern matches builder calls', () => {
    const zod = FACT_CLAIM_PATTERNS.find((p) => p.library === 'zod');
    expect(zod).toBeDefined();
    expect(zod!.pattern.test('z.string(')).toBe(true);
    expect(zod!.pattern.test('z.object(')).toBe(true);
  });

  it('prisma pattern matches query chains', () => {
    const prisma = FACT_CLAIM_PATTERNS.find((p) => p.library === '@prisma/client');
    expect(prisma).toBeDefined();
    expect(prisma!.pattern.test('prisma.user.findMany')).toBe(true);
    expect(prisma!.pattern.test('prisma.post.create')).toBe(true);
  });

  it('library ids are unique', () => {
    const libs = FACT_CLAIM_PATTERNS.map((p) => p.library);
    const unique = new Set(libs);
    expect(unique.size).toBe(libs.length);
  });
});
