// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';

import type { CommandBlock, UseCommandBlocksResult } from './useCommandBlocks';
import type { CommandBlockRefs, CommandBlockState } from './useCommandBlocksHandlers';
import {
  useBlockOutput,
  useDataHandler,
  useNavigateNext,
  useNavigatePrev,
  useNavigateTo,
  useOsc133Handler,
  useResetBlocks,
  useToggleCollapse,
} from './useCommandBlocksHandlers';

describe('useCommandBlocksHandlers', () => {
  const createMockTerminal = (): Terminal => ({
    buffer: {
      active: {
        getLine: vi.fn(() => ({
          translateToString: () => 'test line',
        })),
        viewportY: 0,
        cursorY: 5,
      },
    },
    scrollToLine: vi.fn(),
  } as unknown as Terminal);

  const createMockState = (): CommandBlockState => {
    const refs: React.MutableRefObject<CommandBlockRefs> = {
      current: {
        blocks: [
          { id: '1', command: 'ls', startLine: 0, endLine: 5, promptLine: 0, outputStartLine: 1, timestamp: 0, collapsed: false, complete: true, source: 'osc133' },
        ],
        currentBlock: null,
        heuristicTimer: null,
        osc133Active: null,
        pendingPromptRow: null,
      },
    };

    return {
      blocks: refs.current.blocks,
      activeBlockIndex: 0,
      osc133Active: null,
      refs,
      setActiveBlockIndex: vi.fn(),
      setBlocks: vi.fn(),
      setOsc133Active: vi.fn(),
    };
  };

  describe('useOsc133Handler', () => {
    it('returns a callable handler', () => {
      const state = createMockState();
      const handleOscSequence = vi.fn();
      const handler = renderHook(() => useOsc133Handler(true, state, handleOscSequence)).result.current;
      expect(typeof handler).toBe('function');
    });

    it('calls handleOscSequence when enabled', () => {
      const state = createMockState();
      const handleOscSequence = vi.fn();
      const handler = renderHook(() => useOsc133Handler(true, state, handleOscSequence)).result.current;
      const term = createMockTerminal();
      handler('A', undefined, term);
      expect(handleOscSequence).toHaveBeenCalledWith('A', undefined, term);
    });

    it('does not call handleOscSequence when disabled', () => {
      const state = createMockState();
      const handleOscSequence = vi.fn();
      const handler = renderHook(() => useOsc133Handler(false, state, handleOscSequence)).result.current;
      const term = createMockTerminal();
      handler('A', undefined, term);
      expect(handleOscSequence).not.toHaveBeenCalled();
    });
  });

  describe('useDataHandler', () => {
    it('returns a callable handler', () => {
      const state = createMockState();
      const handleHeuristicData = vi.fn();
      const handler = renderHook(() => useDataHandler(true, state, null, handleHeuristicData)).result.current;
      expect(typeof handler).toBe('function');
    });

    it('does not call handleHeuristicData when osc133Active is true', () => {
      const state = createMockState();
      state.refs.current.osc133Active = true;
      const handleHeuristicData = vi.fn();
      const handler = renderHook(() => useDataHandler(true, state, null, handleHeuristicData)).result.current;
      const term = createMockTerminal();
      handler('test', term);
      expect(handleHeuristicData).not.toHaveBeenCalled();
    });

    it('calls handleHeuristicData when enabled and osc133Active is not true', () => {
      const state = createMockState();
      const handleHeuristicData = vi.fn();
      const handler = renderHook(() => useDataHandler(true, state, null, handleHeuristicData)).result.current;
      const term = createMockTerminal();
      handler('test\n', term);
      expect(handleHeuristicData).toHaveBeenCalledWith('test\n', term, null);
    });
  });

  describe('useNavigateTo', () => {
    it('returns a callable handler', () => {
      const state = createMockState();
      const handler = renderHook(() => useNavigateTo(state)).result.current;
      expect(typeof handler).toBe('function');
    });

    it('scrolls to block startLine and sets active index', () => {
      const state = createMockState();
      const handler = renderHook(() => useNavigateTo(state)).result.current;
      const term = createMockTerminal();
      handler(0, term);
      expect(state.setActiveBlockIndex).toHaveBeenCalledWith(0);
      expect(term.scrollToLine).toHaveBeenCalledWith(0);
    });

    it('does nothing if block index out of bounds', () => {
      const state = createMockState();
      const handler = renderHook(() => useNavigateTo(state)).result.current;
      const term = createMockTerminal();
      handler(999, term);
      expect(state.setActiveBlockIndex).not.toHaveBeenCalled();
    });
  });

  describe('useNavigateNext', () => {
    it('returns a callable handler', () => {
      const state = createMockState();
      const navigateTo = vi.fn<Parameters<UseCommandBlocksResult['navigateTo']>, void>();
      const handler = renderHook(() => useNavigateNext(0, state.refs, navigateTo)).result.current;
      expect(typeof handler).toBe('function');
    });

    it('navigates to next block index', () => {
      const state = createMockState();
      state.refs.current.blocks.push({ id: '2', command: 'pwd', startLine: 6, endLine: 8, promptLine: 6, outputStartLine: 7, timestamp: 0, collapsed: false, complete: true, source: 'osc133' });
      const navigateTo = vi.fn<Parameters<UseCommandBlocksResult['navigateTo']>, void>();
      const handler = renderHook(() => useNavigateNext(0, state.refs, navigateTo)).result.current;
      const term = createMockTerminal();
      handler(term);
      expect(navigateTo).toHaveBeenCalledWith(1, term);
    });

    it('clamps to max blocks length', () => {
      const state = createMockState();
      const navigateTo = vi.fn<Parameters<UseCommandBlocksResult['navigateTo']>, void>();
      const handler = renderHook(() => useNavigateNext(0, state.refs, navigateTo)).result.current;
      const term = createMockTerminal();
      // Only 1 block in state, so activeBlockIndex 0 + 1 should clamp to 0
      handler(term);
      expect(navigateTo).toHaveBeenCalledWith(0, term);
    });
  });

  describe('useNavigatePrev', () => {
    it('returns a callable handler', () => {
      const navigateTo = vi.fn<Parameters<UseCommandBlocksResult['navigatePrev']>, void>();
      const handler = renderHook(() => useNavigatePrev(1, navigateTo)).result.current;
      expect(typeof handler).toBe('function');
    });

    it('navigates to previous block index', () => {
      const navigateTo = vi.fn<Parameters<UseCommandBlocksResult['navigatePrev']>, void>();
      const handler = renderHook(() => useNavigatePrev(1, navigateTo)).result.current;
      const term = createMockTerminal();
      handler(term);
      expect(navigateTo).toHaveBeenCalledWith(0, term);
    });

    it('clamps to 0', () => {
      const navigateTo = vi.fn<Parameters<UseCommandBlocksResult['navigatePrev']>, void>();
      const handler = renderHook(() => useNavigatePrev(0, navigateTo)).result.current;
      const term = createMockTerminal();
      handler(term);
      expect(navigateTo).toHaveBeenCalledWith(0, term);
    });
  });

  describe('useToggleCollapse', () => {
    it('returns a callable handler', () => {
      const state = createMockState();
      const handler = renderHook(() => useToggleCollapse(state)).result.current;
      expect(typeof handler).toBe('function');
    });

    it('toggles collapsed state of block', () => {
      const state = createMockState();
      const handler = renderHook(() => useToggleCollapse(state)).result.current;
      const blockId = '1';
      handler(blockId);
      expect(state.refs.current.blocks[0].collapsed).toBe(true);
      expect(state.setBlocks).toHaveBeenCalled();
    });

    it('does nothing if block id not found', () => {
      const state = createMockState();
      const handler = renderHook(() => useToggleCollapse(state)).result.current;
      handler('nonexistent');
      expect(state.setBlocks).not.toHaveBeenCalled();
    });
  });

  describe('useBlockOutput', () => {
    it('returns a callable handler', () => {
      const handler = renderHook(() => useBlockOutput()).result.current;
      expect(typeof handler).toBe('function');
    });

    it('returns output lines joined by newline', () => {
      const handler = renderHook(() => useBlockOutput()).result.current;
      const term = createMockTerminal();
      const block: CommandBlock = {
        id: '1',
        command: 'ls',
        startLine: 0,
        endLine: 2,
        promptLine: 0,
        outputStartLine: 1,
        timestamp: 0,
        collapsed: false,
        complete: true,
        source: 'osc133',
      };
      const output = handler(block, term);
      expect(typeof output).toBe('string');
      expect(output).toContain('\n');
    });
  });

  describe('useResetBlocks', () => {
    it('returns a callable handler', () => {
      const state = createMockState();
      const clearHeuristicTimer = vi.fn();
      const handler = renderHook(() => useResetBlocks(state, clearHeuristicTimer)).result.current;
      expect(typeof handler).toBe('function');
    });

    it('clears all blocks and state', () => {
      const state = createMockState();
      state.refs.current.blocks = [
        { id: '1', command: 'ls', startLine: 0, endLine: 5, promptLine: 0, outputStartLine: 1, timestamp: 0, collapsed: false, complete: true, source: 'osc133' },
      ];
      const clearHeuristicTimer = vi.fn();
      const handler = renderHook(() => useResetBlocks(state, clearHeuristicTimer)).result.current;
      handler();
      expect(state.refs.current.blocks).toHaveLength(0);
      expect(state.refs.current.currentBlock).toBeNull();
      expect(state.setBlocks).toHaveBeenCalledWith([]);
      expect(state.setActiveBlockIndex).toHaveBeenCalledWith(-1);
    });
  });
});
