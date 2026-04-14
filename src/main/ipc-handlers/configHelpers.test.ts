/**
 * configHelpers.test.ts — Smoke tests for IMPORTABLE_KEYS constant.
 */

import { describe, expect, it } from 'vitest';

import { IMPORTABLE_KEYS } from './configHelpers';

describe('IMPORTABLE_KEYS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(IMPORTABLE_KEYS)).toBe(true);
    expect(IMPORTABLE_KEYS.length).toBeGreaterThan(0);
  });

  it('contains expected keys', () => {
    expect(IMPORTABLE_KEYS).toContain('activeTheme');
    expect(IMPORTABLE_KEYS).toContain('defaultProjectRoot');
    expect(IMPORTABLE_KEYS).toContain('recentProjects');
  });

  it('does not contain secret keys', () => {
    expect(IMPORTABLE_KEYS).not.toContain('webAccessToken');
    expect(IMPORTABLE_KEYS).not.toContain('webAccessPassword');
  });

  it('contains no duplicate entries', () => {
    const unique = new Set(IMPORTABLE_KEYS);
    expect(unique.size).toBe(IMPORTABLE_KEYS.length);
  });
});
