import React from 'react';

import {
  useCommandPaletteActions,
  useCommandPaletteLifecycle,
} from './commandPaletteActions';
import { useCommandPaletteData, useCommandPaletteState } from './commandPaletteState';
import { buildCommandPaletteModel } from './commandPaletteViewModel';
import { groupByCategory } from './commandSearch';
import type { Command, CommandMatch } from './types';

interface UseCommandPaletteModelOptions {
  commands: Command[];
  isOpen: boolean;
  onClose: () => void;
  onExecute: (command: Command) => Promise<void>;
  recentIds: string[];
}

export interface CommandPaletteModel {
  emptyLabel: string;
  footerHints: string[];
  grouped: ReturnType<typeof groupByCategory>;
  handleExecute: (command: Command) => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleMouseEnter: (command: Command) => void;
  handleQueryChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: CommandMatch[];
  navigateBack: () => void;
  navStack: Command[];
  placeholder: string;
  query: string;
  selectedId?: string;
  selectedIndex: number;
  showHeaders: boolean;
}

export function useCommandPaletteModel(options: UseCommandPaletteModelOptions): CommandPaletteModel {
  const state = useCommandPaletteState();
  const data = useCommandPaletteData({
    commands: options.commands,
    navStack: state.navStack,
    query: state.query,
    recentIds: options.recentIds,
  });
  const actions = useCommandPaletteActions({
    matches: data.matches,
    onClose: options.onClose,
    onExecute: options.onExecute,
    selectedIndex: state.selectedIndex,
    setNavStack: state.setNavStack,
    setQuery: state.setQuery,
    setSelectedIndex: state.setSelectedIndex,
    stackDepth: state.navStack.length,
  });

  useCommandPaletteLifecycle({
    inputRef: state.inputRef,
    isOpen: options.isOpen,
    listRef: state.listRef,
    matchesLength: data.matches.length,
    resetSearch: actions.resetSearch,
    selectedIndex: state.selectedIndex,
    setNavStack: state.setNavStack,
    setSelectedIndex: state.setSelectedIndex,
  });

  return buildCommandPaletteModel({
    actions,
    grouped: data.grouped,
    inputRef: state.inputRef,
    listRef: state.listRef,
    matches: data.matches,
    navStack: state.navStack,
    query: state.query,
    recentCount: options.recentIds.length,
    selectedIndex: state.selectedIndex,
  });
}
