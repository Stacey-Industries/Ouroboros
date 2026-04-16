/**
 * axe.test.ts — Smoke tests for the shared axe helper.
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { axe } from './axe';

describe('axe helper', () => {
  it('exports a callable axe function', () => {
    expect(typeof axe).toBe('function');
  });

  it('registers toHaveNoViolations on expect via vitest-axe/extend-expect', () => {
    // The matcher is registered as a side effect of importing axe.ts.
    // We verify it exists on the expect object rather than importing it as a value
    // (the vitest-axe/matchers declaration uses `export type *` so direct
    // re-export is not permitted under isolatedModules).
    expect(typeof (expect as unknown as Record<string, unknown>)['toHaveNoViolations']).not.toBe('undefined');
  });
});
