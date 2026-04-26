import type { Terminal } from '@xterm/xterm';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect } from 'react';

import type { ShellIntegrationAddon, ShellIntegrationEvent } from './shellIntegrationAddon';
import type {
  CommandBlock,
  UseCommandBlocksResult,
} from './useCommandBlocks';

interface CommandBlockRefs {
  blocks: CommandBlock[];
  currentBlock: CommandBlock | null;
  heuristicTimer: ReturnType<typeof setTimeout> | null;
  osc133Active: boolean | null;
  pendingPromptRow: number | null;
}

interface CommandBlockState {
  blocks: CommandBlock[];
  activeBlockIndex: number;
  osc133Active: boolean | null;
  refs: MutableRefObject<CommandBlockRefs>;
  setActiveBlockIndex: Dispatch<SetStateAction<number>>;
  setBlocks: Dispatch<SetStateAction<CommandBlock[]>>;
  setOsc133Active: Dispatch<SetStateAction<boolean | null>>;
}

function getLineText(term: Terminal, row: number): string {
  const line = term.buffer.active.getLine(row);
  return line ? line.translateToString(true).trimEnd() : '';
}

function commitBlocks(state: CommandBlockState, nextBlocks: CommandBlock[]): void {
  state.refs.current.blocks = nextBlocks;
  state.setBlocks([...nextBlocks]);
}

export function useOsc133Handler(
  enabled: boolean,
  _state: CommandBlockState,
  handleOscSequence: (sequence: string, param: string | undefined, term: Terminal) => void,
): UseCommandBlocksResult['handleOsc133'] {
  return useCallback(
    (sequence, param, term) => {
      if (enabled) handleOscSequence(sequence, param, term);
    },
    [enabled, handleOscSequence],
  );
}

export function useDataHandler(
  enabled: boolean,
  state: CommandBlockState,
  customPattern: RegExp | null,
  handleHeuristicData: (data: string, term: Terminal, customPattern: RegExp | null) => void,
): UseCommandBlocksResult['handleData'] {
  return useCallback(
    (data, term) => {
      if (!enabled || state.refs.current.osc133Active === true) return;
      handleHeuristicData(data, term, customPattern);
    },
    [customPattern, enabled, handleHeuristicData, state],
  );
}

export function useNavigateTo(state: CommandBlockState): UseCommandBlocksResult['navigateTo'] {
  return useCallback(
    (index, term) => {
      const block = state.refs.current.blocks[index];
      if (!block) return;
      state.setActiveBlockIndex(index);
      term.scrollToLine(block.startLine);
    },
    [state],
  );
}

export function useNavigateNext(
  activeBlockIndex: number,
  refs: MutableRefObject<CommandBlockRefs>,
  navigateTo: UseCommandBlocksResult['navigateTo'],
): UseCommandBlocksResult['navigateNext'] {
  return useCallback(
    (term) => {
      navigateTo(Math.min(activeBlockIndex + 1, refs.current.blocks.length - 1), term);
    },
    [activeBlockIndex, navigateTo, refs],
  );
}

export function useNavigatePrev(
  activeBlockIndex: number,
  navigateTo: UseCommandBlocksResult['navigateTo'],
): UseCommandBlocksResult['navigatePrev'] {
  return useCallback(
    (term) => {
      navigateTo(Math.max(activeBlockIndex - 1, 0), term);
    },
    [activeBlockIndex, navigateTo],
  );
}

export function useToggleCollapse(state: CommandBlockState): UseCommandBlocksResult['toggleCollapse'] {
  return useCallback(
    (blockId) => {
      const index = state.refs.current.blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return;
      state.refs.current.blocks[index].collapsed = !state.refs.current.blocks[index].collapsed;
      commitBlocks(state, [...state.refs.current.blocks]);
    },
    [state],
  );
}

export function useBlockOutput(): UseCommandBlocksResult['getBlockOutput'] {
  return useCallback((block, term) => {
    const lines: string[] = [];
    for (let row = block.outputStartLine; row <= block.endLine; row++)
      lines.push(getLineText(term, row));
    return lines.join('\n');
  }, []);
}

export function useResetBlocks(
  state: CommandBlockState,
  clearHeuristicTimer: (state: CommandBlockState) => void,
): UseCommandBlocksResult['reset'] {
  return useCallback(() => {
    state.refs.current.blocks = [];
    state.refs.current.currentBlock = null;
    clearHeuristicTimer(state);
    state.refs.current.pendingPromptRow = null;
    state.setBlocks([]);
    state.setActiveBlockIndex(-1);
  }, [state, clearHeuristicTimer]);
}

export function useOsc633Subscription(
  enabled: boolean,
  state: CommandBlockState,
  handleOsc633Event: (event: ShellIntegrationEvent, state: CommandBlockState) => void,
  addonRef?: { current: ShellIntegrationAddon | null },
): void {
  useEffect(() => {
    if (!enabled || !addonRef?.current) return;

    const addon = addonRef.current;
    const unsubscribe = addon.onEvent((event) => {
      handleOsc633Event(event, state);
    });

    return unsubscribe;
  }, [enabled, addonRef, handleOsc633Event, state]);
}

export type { CommandBlockRefs, CommandBlockState };
