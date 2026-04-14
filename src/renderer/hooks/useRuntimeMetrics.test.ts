/**
 * useRuntimeMetrics.test.ts — Smoke tests for useRuntimeMetrics hook.
 */

import { describe, expect, it } from 'vitest';

import { useRuntimeMetrics } from './useRuntimeMetrics';

describe('useRuntimeMetrics', () => {
  it('exports the hook as a function', () => {
    expect(typeof useRuntimeMetrics).toBe('function');
  });
});
