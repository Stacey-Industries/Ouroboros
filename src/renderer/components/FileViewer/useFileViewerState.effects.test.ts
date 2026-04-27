import { describe, expect, it } from 'vitest';

import {
  defaultViewModeForFile,
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

  describe('defaultViewModeForFile', () => {
    it('returns preview for HTML files', () => {
      expect(defaultViewModeForFile(true, false)).toBe('preview');
    });

    it('returns preview for markdown files', () => {
      expect(defaultViewModeForFile(false, true)).toBe('preview');
    });

    it('returns code for plain source files', () => {
      expect(defaultViewModeForFile(false, false)).toBe('code');
    });
  });
});
