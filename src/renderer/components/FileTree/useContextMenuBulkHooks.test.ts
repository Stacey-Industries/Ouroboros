/**
 * useContextMenuBulkHooks.test.ts — smoke tests for useBulkHandlers.
 */

import { describe, expect, it } from 'vitest';

// useBulkHandlers depends on zustand store and window.electronAPI — just verify it exports.
import { useBulkHandlers } from './useContextMenuBulkHooks';

describe('useBulkHandlers', () => {
  it('is a function', () => {
    expect(typeof useBulkHandlers).toBe('function');
  });
});
