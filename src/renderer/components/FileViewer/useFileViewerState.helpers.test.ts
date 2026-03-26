import { describe, expect, it, vi } from 'vitest';

import { hasConflictMarkers,parseConflictBlocks } from './ConflictResolver.model';
import { createDiffMap, createFileViewerState, createKeyboardInput, parseConflictContent, toggleCollapsedFold } from './useFileViewerState.helpers';
import type { FoldRange } from './useFoldRanges';

describe('useFileViewerState helpers', () => {
  it('builds a diff lookup map keyed by line number', () => {
    const diffMap = createDiffMap([
      { line: 1, kind: 'added' },
      { line: 2, kind: 'deleted' },
      { line: 2, kind: 'modified' },
    ]);

    expect(diffMap.get(1)).toBe('added');
    expect(diffMap.get(2)).toBe('modified');
  });

  it('parses conflict content only when markers exist', () => {
    const plainParser = vi.fn(() => []);
    expect(parseConflictContent('plain text', hasConflictMarkers, plainParser)).toEqual([]);
    expect(plainParser).not.toHaveBeenCalled();

    const content = ['<<<<<<< ours', 'left', '=======', 'right', '>>>>>>> theirs'].join('\n');
    const blocks = parseConflictContent(content, hasConflictMarkers, parseConflictBlocks);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.oursLines).toEqual(['left']);
    expect(blocks[0]?.theirsLines).toEqual(['right']);
  });

  it('toggles folded lines immutably', () => {
    const original = new Set([3]);
    const collapsed = toggleCollapsedFold(original, 7);
    const expanded = toggleCollapsedFold(collapsed, 3);

    expect(original.has(7)).toBe(false);
    expect(collapsed.has(3)).toBe(true);
    expect(collapsed.has(7)).toBe(true);
    expect(expanded.has(3)).toBe(false);
  });

  it('assembles keyboard input and viewer state snapshots', () => {
    const refs = {
      codeRef: { current: null },
      scrollRef: { current: null },
      containerRef: { current: null },
    };
    const foldableLines = new Map<number, FoldRange>([[10, { start: 10, end: 14 }]]);
    const collapsedFolds = new Set([10]);
    const setCollapsedFolds = vi.fn();
    const setWordWrap = vi.fn();
    const setShowSearch = vi.fn();
    const setShowGoToLine = vi.fn();
    const setViewMode = vi.fn();
    const keyboardInput = createKeyboardInput({
      refs,
      foldableLines,
      hasDiff: true,
      ui: { setShowSearch, setShowGoToLine, setViewMode },
      folds: { collapsedFolds, setCollapsedFolds },
      setWordWrap,
    });

    expect(keyboardInput.hasDiff).toBe(true);
    expect(keyboardInput.foldableLines).toBe(foldableLines);
    expect(keyboardInput.setShowSearch).toBe(setShowSearch);

    const state = createFileViewerState({
      refs,
      ideThemeId: 'modern',
      toggles: {
        wordWrap: true,
        setWordWrap,
        showMinimap: false,
        setShowMinimap: vi.fn(),
        showBlame: false,
        setShowBlame: vi.fn(),
        showOutline: true,
        setShowOutline: vi.fn(),
        formatOnSave: false,
        setFormatOnSave: vi.fn(),
      },
      ui: {
        showSearch: false,
        setShowSearch,
        showGoToLine: true,
        setShowGoToLine,
        searchMatchLines: [2, 5],
        setSearchMatchLines: vi.fn(),
        viewMode: 'code',
        setViewMode,
        showHistory: false,
        setShowHistory: vi.fn(),
        editMode: true,
        setEditMode: vi.fn(),
        claudeMdEnhanced: false,
        setClaudeMdEnhanced: vi.fn(),
      },
      derived: {
        isClaudeMd: false,
        isMarkdown: true,
        hasDiff: true,
        diffBaseContent: null,
      },
      data: {
        highlightedHtml: '<span>hi</span>',
        highlightLang: 'ts',
        diffLines: [{ line: 2, kind: 'modified' }],
        diffMap: new Map([[2, 'modified']]),
        blameLines: [],
        foldableLines,
        scrollMetrics: { scrollTop: 12, scrollHeight: 90, containerHeight: 30 },
        outlineSymbols: [{ name: 'demo' }],
      },
      conflicts: {
        conflictBlocks: [],
        handleConflictResolved: vi.fn(),
      },
      folds: {
        collapsedFolds,
        setCollapsedFolds,
        toggleFold: vi.fn(),
      },
    });

    expect(state.ideThemeId).toBe('modern');
    expect(state.wordWrap).toBe(true);
    expect(state.editMode).toBe(true);
    expect(state.diffMap.get(2)).toBe('modified');
    expect(state.searchMatchLines).toEqual([2, 5]);
  });
});
