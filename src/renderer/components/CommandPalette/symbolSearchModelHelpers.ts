import Fuse from 'fuse.js';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import type { SymbolEntry } from '../../types/electron';
import type { MatchResult } from './useSymbolSearchModel';

const MAX_RESULTS = 30;

const FUSE_OPTIONS: Fuse.IFuseOptions<SymbolEntry> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'relativePath', weight: 0.3 },
  ],
  threshold: 0.4,
  distance: 200,
  minMatchCharLength: 1,
  includeScore: true,
  includeMatches: true,
};

export interface SymbolSearchState {
  allSymbols: SymbolEntry[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  loadError: string | null;
  query: string;
  selectedIndex: number;
  setAllSymbols: React.Dispatch<React.SetStateAction<SymbolEntry[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadError: React.Dispatch<React.SetStateAction<string | null>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}

export interface SymbolSearchActions {
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleQueryChange: (value: string) => void;
  handleSelect: (entry: SymbolEntry) => void;
}

export function useSymbolSearchState(): SymbolSearchState {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allSymbols, setAllSymbols] = useState<SymbolEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  return {
    allSymbols,
    inputRef,
    isLoading,
    listRef,
    loadError,
    query,
    selectedIndex,
    setAllSymbols,
    setIsLoading,
    setLoadError,
    setQuery,
    setSelectedIndex,
  };
}

export function useSymbolMatches(query: string, allSymbols: SymbolEntry[]): MatchResult[] {
  return useMemo(() => {
    const trimmed = query.trim();

    if (trimmed === '') {
      return allSymbols.slice(0, MAX_RESULTS).map((entry) => ({
        entry,
        nameIndices: [],
        pathIndices: [],
      }));
    }

    return new Fuse(allSymbols, FUSE_OPTIONS)
      .search(trimmed, { limit: MAX_RESULTS })
      .map(buildMatchResult);
  }, [allSymbols, query]);
}

function buildMatchResult(result: Fuse.FuseResult<SymbolEntry>): MatchResult {
  return {
    entry: result.item,
    nameIndices: getMatchIndices(result.matches, 'name'),
    pathIndices: getMatchIndices(result.matches, 'relativePath'),
  };
}

function getMatchIndices(
  matches: ReadonlyArray<Fuse.FuseResultMatch> | undefined,
  key: 'name' | 'relativePath',
): ReadonlyArray<readonly [number, number]> {
  return (matches?.find((match) => match.key === key)?.indices ?? []) as ReadonlyArray<
    readonly [number, number]
  >;
}

export function useSymbolSearchActions({
  matches,
  onClose,
  selectedIndex,
  setQuery,
  setSelectedIndex,
}: {
  matches: MatchResult[];
  onClose: () => void;
  selectedIndex: number;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}): SymbolSearchActions {
  const handleSelect = useSymbolSelect(onClose);
  const handleQueryChange = useQueryChange(setQuery, setSelectedIndex);
  const handleKeyDown = usePickerKeyboard({
    handleSelect,
    matches,
    onClose,
    selectedIndex,
    setSelectedIndex,
  });

  return { handleKeyDown, handleQueryChange, handleSelect };
}

function useQueryChange(
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): (value: string) => void {
  return useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  }, [setQuery, setSelectedIndex]);
}

function useSymbolSelect(onClose: () => void): (entry: SymbolEntry) => void {
  return useCallback((entry: SymbolEntry) => {
    onClose();
    window.dispatchEvent(new CustomEvent('agent-ide:open-file', {
      detail: { filePath: entry.filePath, line: entry.line },
    }));
  }, [onClose]);
}

function usePickerKeyboard({
  handleSelect,
  matches,
  onClose,
  selectedIndex,
  setSelectedIndex,
}: {
  handleSelect: (entry: SymbolEntry) => void;
  matches: MatchResult[];
  onClose: () => void;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}): (event: React.KeyboardEvent<HTMLInputElement>) => void {
  return useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    const handler = getKeyboardHandler({
      eventKey: event.key,
      handleSelect,
      matches,
      onClose,
      selectedIndex,
      setSelectedIndex,
    });

    if (!handler) {
      return;
    }

    event.preventDefault();
    handler();
  }, [handleSelect, matches, onClose, selectedIndex, setSelectedIndex]);
}

function getKeyboardHandler({
  eventKey,
  handleSelect,
  matches,
  onClose,
  selectedIndex,
  setSelectedIndex,
}: {
  eventKey: string;
  handleSelect: (entry: SymbolEntry) => void;
  matches: MatchResult[];
  onClose: () => void;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}): (() => void) | null {
  const handlers: Record<string, () => void> = {
    ArrowDown: () => cycleSelection(matches.length, 1, setSelectedIndex),
    ArrowUp: () => cycleSelection(matches.length, -1, setSelectedIndex),
    Enter: () => {
      if (matches[selectedIndex]) {
        handleSelect(matches[selectedIndex].entry);
      }
    },
    Escape: onClose,
  };

  return handlers[eventKey] ?? null;
}

function cycleSelection(
  length: number,
  direction: 1 | -1,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): void {
  setSelectedIndex((previous) => {
    if (length === 0) {
      return 0;
    }

    return (previous + direction + length) % length;
  });
}

export function buildSymbolSearchModel({
  actions,
  matches,
  projectRoot,
  state,
}: {
  actions: SymbolSearchActions;
  matches: MatchResult[];
  projectRoot: string | null;
  state: SymbolSearchState;
}) {
  return {
    allSymbols: state.allSymbols,
    emptyLabel: getEmptyLabel(projectRoot, state.loadError, state.isLoading, state.query),
    handleKeyDown: actions.handleKeyDown,
    handleQueryChange: actions.handleQueryChange,
    handleSelect: actions.handleSelect,
    inputRef: state.inputRef,
    isLoading: state.isLoading,
    listRef: state.listRef,
    matches,
    query: state.query,
    selectedIndex: state.selectedIndex,
    setSelectedIndex: state.setSelectedIndex,
  };
}

function getEmptyLabel(
  projectRoot: string | null,
  loadError: string | null,
  isLoading: boolean,
  query: string,
): string {
  if (!projectRoot) {
    return 'No project open';
  }

  if (loadError) {
    return `Error: ${loadError}`;
  }

  if (isLoading) {
    return 'Scanning for symbols...';
  }

  if (query.trim()) {
    return 'No symbols matched';
  }

  return 'No symbols found';
}
