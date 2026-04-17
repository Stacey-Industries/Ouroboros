/**
 * stalenessMatrixDenylist.test.ts — smoke tests for the denylist data module.
 */

import { describe, expect, it } from 'vitest';

import {
  HEURISTIC_DENYLIST,
  INTERNAL_PACKAGE_PREFIXES,
} from './stalenessMatrixDenylist';

describe('HEURISTIC_DENYLIST', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(HEURISTIC_DENYLIST)).toBe(true);
    expect(HEURISTIC_DENYLIST.length).toBeGreaterThan(0);
  });

  it('contains the core stable libraries', () => {
    const core = ['lodash', 'ramda', 'date-fns', 'uuid', 'nanoid', 'clsx', 'tslib'];
    for (const lib of core) {
      expect(HEURISTIC_DENYLIST).toContain(lib);
    }
  });

  it('contains react-dom and typescript suppressions', () => {
    expect(HEURISTIC_DENYLIST).toContain('react-dom');
    expect(HEURISTIC_DENYLIST).toContain('typescript');
  });

  it('contains no duplicate entries', () => {
    const set = new Set(HEURISTIC_DENYLIST);
    expect(set.size).toBe(HEURISTIC_DENYLIST.length);
  });

  it('contains only non-empty strings', () => {
    for (const entry of HEURISTIC_DENYLIST) {
      expect(typeof entry).toBe('string');
      expect(entry.length).toBeGreaterThan(0);
    }
  });
});

describe('INTERNAL_PACKAGE_PREFIXES', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(INTERNAL_PACKAGE_PREFIXES)).toBe(true);
    expect(INTERNAL_PACKAGE_PREFIXES.length).toBeGreaterThan(0);
  });

  it('contains the standard internal scopes', () => {
    expect(INTERNAL_PACKAGE_PREFIXES).toContain('@internal/');
    expect(INTERNAL_PACKAGE_PREFIXES).toContain('@local/');
    expect(INTERNAL_PACKAGE_PREFIXES).toContain('@private/');
  });

  it('all prefixes end with a slash to prevent partial matches', () => {
    for (const prefix of INTERNAL_PACKAGE_PREFIXES) {
      expect(prefix.endsWith('/')).toBe(true);
    }
  });
});
