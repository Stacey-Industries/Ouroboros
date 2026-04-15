/**
 * axe.test.ts — Smoke tests for the shared axe helper.
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { axe, toHaveNoViolations } from './axe';

describe('axe helper', () => {
  it('exports a callable axe function', () => {
    expect(typeof axe).toBe('function');
  });

  it('exports toHaveNoViolations matcher', () => {
    expect(typeof toHaveNoViolations).toBe('function');
  });
});
