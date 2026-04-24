import { describe, expect, it } from 'vitest';

import {
  useCollapsedFoldState,
  useConflictState,
  useExpandFoldsForSearch,
  useGitDiffBaseContent,
  useLinkHandling,
  useResetViewerUi,
  useScrollReset,
} from './useFileViewerState.effects';

describe('useFileViewerState.effects', () => {
  it('exports all hooks as functions', () => {
    expect(typeof useGitDiffBaseContent).toBe('function');
    expect(typeof useConflictState).toBe('function');
    expect(typeof useCollapsedFoldState).toBe('function');
    expect(typeof useScrollReset).toBe('function');
    expect(typeof useLinkHandling).toBe('function');
    expect(typeof useResetViewerUi).toBe('function');
    expect(typeof useExpandFoldsForSearch).toBe('function');
  });
});
