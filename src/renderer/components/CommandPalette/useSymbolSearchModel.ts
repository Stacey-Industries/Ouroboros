import React from 'react';

import type { SymbolEntry } from '../../types/electron';
import { useSymbolSearchLifecycle } from './symbolSearchLifecycle';
import {
  buildSymbolSearchModel,
  useSymbolMatches,
  useSymbolSearchActions,
  useSymbolSearchState,
} from './symbolSearchModelHelpers';

export interface SymbolSearchProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
}

export type MatchResult = {
  entry: SymbolEntry;
  nameIndices: ReadonlyArray<readonly [number, number]>;
  pathIndices: ReadonlyArray<readonly [number, number]>;
};

export interface SymbolSearchModel {
  allSymbols: SymbolEntry[];
  emptyLabel: string;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleQueryChange: (value: string) => void;
  handleSelect: (entry: SymbolEntry) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: MatchResult[];
  query: string;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function useSymbolSearchModel({
  isOpen,
  onClose,
  projectRoot,
}: SymbolSearchProps): SymbolSearchModel {
  const state = useSymbolSearchState();
  const matches = useSymbolMatches(state.query, state.allSymbols);
  const actions = useSymbolSearchActions({
    matches,
    onClose,
    setQuery: state.setQuery,
    setSelectedIndex: state.setSelectedIndex,
    selectedIndex: state.selectedIndex,
  });

  useSymbolSearchLifecycle({
    inputRef: state.inputRef,
    isOpen,
    listRef: state.listRef,
    matchesLength: matches.length,
    projectRoot,
    setAllSymbols: state.setAllSymbols,
    setIsLoading: state.setIsLoading,
    setLoadError: state.setLoadError,
    setQuery: state.setQuery,
    setSelectedIndex: state.setSelectedIndex,
    selectedIndex: state.selectedIndex,
  });

  return buildSymbolSearchModel({ actions, matches, projectRoot, state });
}
