import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { SearchBarProps, SearchMatch } from './SearchBar';
import { clearHighlights, getMatchLabel, searchInContainer, syncActiveMatch } from './SearchBar.search';

interface SearchState {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  caseSensitive: boolean;
  setCaseSensitive: React.Dispatch<React.SetStateAction<boolean>>;
  useRegex: boolean;
  setUseRegex: React.Dispatch<React.SetStateAction<boolean>>;
  matches: SearchMatch[];
  setMatches: React.Dispatch<React.SetStateAction<SearchMatch[]>>;
  activeMatchIndex: number;
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>;
}

interface SearchRunnerParams {
  codeContainer: HTMLElement | null;
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
  resetResults: (notifyLines: boolean) => void;
  setMatches: React.Dispatch<React.SetStateAction<SearchMatch[]>>;
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>;
  onMatchLinesChange?: (lines: number[]) => void;
}

export interface SearchBarController {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (value: string) => void;
  caseSensitive: boolean;
  toggleCaseSensitive: () => void;
  useRegex: boolean;
  toggleRegex: () => void;
  matchLabel: string;
  canNavigate: boolean;
  goToPrev: () => void;
  goToNext: () => void;
  handleClose: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

function useSearchState(): SearchState {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  return {
    query,
    setQuery,
    caseSensitive,
    setCaseSensitive,
    useRegex,
    setUseRegex,
    matches,
    setMatches,
    activeMatchIndex,
    setActiveMatchIndex,
  };
}

function useResetResults(
  setMatches: React.Dispatch<React.SetStateAction<SearchMatch[]>>,
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>,
  onMatchLinesChange?: (lines: number[]) => void,
): (notifyLines: boolean) => void {
  return useCallback((notifyLines: boolean) => {
    setMatches([]);
    setActiveMatchIndex(0);
    if (notifyLines) {
      onMatchLinesChange?.([]);
    }
  }, [onMatchLinesChange, setActiveMatchIndex, setMatches]);
}

function useSearchRunner(params: SearchRunnerParams): () => void {
  const {
    caseSensitive,
    codeContainer,
    onMatchLinesChange,
    query,
    resetResults,
    setActiveMatchIndex,
    setMatches,
    useRegex,
  } = params;
  return useCallback(() => {
    if (!codeContainer || !query) {
      clearHighlights(codeContainer);
      resetResults(true);
      return;
    }
    clearHighlights(codeContainer);
    const result = searchInContainer({ codeContainer, query, caseSensitive, useRegex });
    if (!result) {
      resetResults(true);
      return;
    }
    setMatches(result.matches);
    setActiveMatchIndex(0);
    onMatchLinesChange?.(result.lineNumbers);
  }, [caseSensitive, codeContainer, onMatchLinesChange, query, resetResults, setActiveMatchIndex, setMatches, useRegex]);
}

function useFocusOnOpen(visible: boolean, inputRef: React.RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    if (!visible || !inputRef.current) {
      return;
    }
    inputRef.current.focus();
    inputRef.current.select();
  }, [inputRef, visible]);
}

function useDebouncedSearch(performSearch: () => void): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      performSearch();
    }, 150);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [performSearch]);
}

function useActiveMatchSync(codeContainer: HTMLElement | null, activeMatchIndex: number, matchCount: number): void {
  useEffect(() => {
    syncActiveMatch(codeContainer, activeMatchIndex);
  }, [activeMatchIndex, codeContainer, matchCount]);
}

function useResetOnHide(
  codeContainer: HTMLElement | null,
  visible: boolean,
  resetResults: (notifyLines: boolean) => void,
): void {
  useEffect(() => {
    if (visible) {
      return;
    }
    clearHighlights(codeContainer);
    resetResults(true);
  }, [codeContainer, resetResults, visible]);
}

function useMatchNavigation(
  matchCount: number,
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>,
): { goToNext: () => void; goToPrev: () => void } {
  const goToNext = useCallback(() => {
    if (matchCount === 0) {
      return;
    }
    setActiveMatchIndex((index) => (index + 1) % matchCount);
  }, [matchCount, setActiveMatchIndex]);
  const goToPrev = useCallback(() => {
    if (matchCount === 0) {
      return;
    }
    setActiveMatchIndex((index) => (index - 1 + matchCount) % matchCount);
  }, [matchCount, setActiveMatchIndex]);
  return { goToNext, goToPrev };
}

function useCloseSearch(
  codeContainer: HTMLElement | null,
  onClose: () => void,
  setMatches: React.Dispatch<React.SetStateAction<SearchMatch[]>>,
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>,
): () => void {
  return useCallback(() => {
    clearHighlights(codeContainer);
    setMatches([]);
    setActiveMatchIndex(0);
    onClose();
  }, [codeContainer, onClose, setActiveMatchIndex, setMatches]);
}

function useSearchKeyDown(handleClose: () => void, goToPrev: () => void, goToNext: () => void) {
  return useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
      return;
    }
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      goToPrev();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      goToNext();
    }
  }, [goToNext, goToPrev, handleClose]);
}

export function useSearchBarController(props: SearchBarProps): SearchBarController {
  const { codeContainer, visible, onClose, onMatchLinesChange } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const state = useSearchState();
  const resetResults = useResetResults(state.setMatches, state.setActiveMatchIndex, onMatchLinesChange);
  const performSearch = useSearchRunner({
    codeContainer,
    query: state.query,
    caseSensitive: state.caseSensitive,
    useRegex: state.useRegex,
    resetResults,
    setMatches: state.setMatches,
    setActiveMatchIndex: state.setActiveMatchIndex,
    onMatchLinesChange,
  });
  useFocusOnOpen(visible, inputRef);
  useDebouncedSearch(performSearch);
  useActiveMatchSync(codeContainer, state.activeMatchIndex, state.matches.length);
  useResetOnHide(codeContainer, visible, resetResults);
  const { goToNext, goToPrev } = useMatchNavigation(state.matches.length, state.setActiveMatchIndex);
  const handleClose = useCloseSearch(codeContainer, onClose, state.setMatches, state.setActiveMatchIndex);
  const handleKeyDown = useSearchKeyDown(handleClose, goToPrev, goToNext);
  return {
    inputRef,
    query: state.query,
    setQuery: state.setQuery,
    caseSensitive: state.caseSensitive,
    toggleCaseSensitive: () => state.setCaseSensitive((value) => !value),
    useRegex: state.useRegex,
    toggleRegex: () => state.setUseRegex((value) => !value),
    matchLabel: getMatchLabel(state.query, state.matches.length, state.activeMatchIndex),
    canNavigate: state.matches.length > 0,
    goToPrev,
    goToNext,
    handleClose,
    handleKeyDown,
  };
}
