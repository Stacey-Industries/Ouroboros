/**
 * FileViewerManager.state.test.ts — smoke tests for useFileViewerManagerState.
 */

import { describe, expect, it } from 'vitest';

import { useFileViewerManagerState } from './FileViewerManager.state';

describe('useFileViewerManagerState', () => {
  it('is a function', () => {
    expect(typeof useFileViewerManagerState).toBe('function');
  });
});
