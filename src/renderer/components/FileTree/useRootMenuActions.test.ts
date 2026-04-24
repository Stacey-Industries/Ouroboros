/**
 * useRootMenuActions.test.ts — smoke tests for useMenuActions.
 */

import { describe, expect, it } from 'vitest';

import { useMenuActions } from './useRootMenuActions';

describe('useMenuActions', () => {
  it('is a function', () => {
    expect(typeof useMenuActions).toBe('function');
  });
});
