/**
 * useStartupTimings.test.ts — Smoke tests for useStartupTimings hook.
 */

import { describe, expect, it } from 'vitest';

import { useStartupTimings } from './useStartupTimings';

describe('useStartupTimings', () => {
  it('exports the hook as a function', () => {
    expect(typeof useStartupTimings).toBe('function');
  });
});
