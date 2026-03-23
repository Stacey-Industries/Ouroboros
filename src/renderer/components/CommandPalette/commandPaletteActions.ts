import React, { useCallback, useEffect } from 'react';

import type { Command, CommandMatch } from './types';

export interface CommandPaletteActions {
  handleExecute: (command: Command) => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleMouseEnter: (command: Command) => void;
  handleQueryChange: (value: string) => void;
  navigateBack: () => void;
  resetSearch: () => void;
}

type ActionOptions = {
  matches: CommandMatch[];
  onClose: () => void;
  onExecute: (command: Command) => Promise<void>;
  selectedIndex: number;
  setNavStack: React.Dispatch<React.SetStateAction<Command[]>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  stackDepth: number;
};

export function useCommandPaletteActions({
  matches,
  onClose,
  onExecute,
  selectedIndex,
  setNavStack,
  setQuery,
  setSelectedIndex,
  stackDepth,
}: ActionOptions): CommandPaletteActions {
  const resetSearch = useResetSearch(setQuery, setSelectedIndex);
  const { navigateBack, navigateInto } = useNavigationActions(setNavStack, resetSearch);
  const handleExecute = useExecuteCommand({ navigateInto, onClose, onExecute });
  const handleMouseEnter = useHoveredSelection(matches, setSelectedIndex);
  const handleQueryChange = useQueryChange(setQuery, setSelectedIndex);
  const handleKeyDown = useKeyboardNav({
    handleExecute,
    matches,
    navigateBack,
    navigateInto,
    onClose,
    selectedIndex,
    setSelectedIndex,
    stackDepth,
  });

  return {
    handleExecute,
    handleKeyDown,
    handleMouseEnter,
    handleQueryChange,
    navigateBack,
    resetSearch,
  };
}

function useResetSearch(
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): () => void {
  return useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
  }, [setQuery, setSelectedIndex]);
}

function useNavigationActions(
  setNavStack: React.Dispatch<React.SetStateAction<Command[]>>,
  resetSearch: () => void,
): {
  navigateBack: () => void;
  navigateInto: (command: Command) => void;
} {
  const navigateInto = useCallback((command: Command) => {
    setNavStack((previous) => [...previous, command]);
    resetSearch();
  }, [resetSearch, setNavStack]);
  const navigateBack = useCallback(() => {
    setNavStack((previous) => previous.slice(0, -1));
    resetSearch();
  }, [resetSearch, setNavStack]);

  return { navigateBack, navigateInto };
}

function useExecuteCommand({
  navigateInto,
  onClose,
  onExecute,
}: {
  navigateInto: (command: Command) => void;
  onClose: () => void;
  onExecute: (command: Command) => Promise<void>;
}): (command: Command) => Promise<void> {
  return useCallback(async (command: Command) => {
    if (hasChildren(command)) {
      navigateInto(command);
      return;
    }

    onClose();
    await onExecute(command);
  }, [navigateInto, onClose, onExecute]);
}

function useHoveredSelection(
  matches: CommandMatch[],
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): (command: Command) => void {
  return useCallback((command: Command) => {
    const index = matches.findIndex((match) => match.command.id === command.id);

    if (index !== -1) {
      setSelectedIndex(index);
    }
  }, [matches, setSelectedIndex]);
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

type LifecycleOptions = {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  matchesLength: number;
  resetSearch: () => void;
  selectedIndex: number;
  setNavStack: React.Dispatch<React.SetStateAction<Command[]>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
};

export function useCommandPaletteLifecycle({
  inputRef,
  isOpen,
  listRef,
  matchesLength,
  resetSearch,
  selectedIndex,
  setNavStack,
  setSelectedIndex,
}: LifecycleOptions): void {
  useResetOnOpen({ inputRef, isOpen, resetSearch, setNavStack });
  useClampIndex(matchesLength, setSelectedIndex);
  useScrollIntoView(listRef, selectedIndex);
}

function useResetOnOpen({
  inputRef,
  isOpen,
  resetSearch,
  setNavStack,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  resetSearch: () => void;
  setNavStack: React.Dispatch<React.SetStateAction<Command[]>>;
}): void {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    resetSearch();
    setNavStack([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inputRef, isOpen, resetSearch, setNavStack]);
}

function useClampIndex(
  length: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): void {
  useEffect(() => {
    setSelectedIndex((previous) => (length === 0 ? 0 : Math.min(previous, length - 1)));
  }, [length, setSelectedIndex]);
}

function useScrollIntoView(
  listRef: React.RefObject<HTMLDivElement | null>,
  selectedIndex: number,
): void {
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: 'nearest' });
  }, [listRef, selectedIndex]);
}

type KeyboardNavOptions = {
  handleExecute: (command: Command) => Promise<void>;
  matches: CommandMatch[];
  navigateBack: () => void;
  navigateInto: (command: Command) => void;
  onClose: () => void;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  stackDepth: number;
};

function useKeyboardNav({
  setSelectedIndex,
  ...options
}: KeyboardNavOptions): (event: React.KeyboardEvent<HTMLInputElement>) => void {
  const { handleEscape, openSelectedChild, runSelectedCommand } = useKeyboardCallbacks(options);

  return useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    const handler = getKeyboardHandler({
      eventKey: event.key,
      handleEscape,
      matchesLength: options.matches.length,
      openSelectedChild,
      runSelectedCommand,
      setSelectedIndex,
    });

    if (!handler) {
      return;
    }

    event.preventDefault();
    handler();
  }, [
    handleEscape,
    openSelectedChild,
    options.matches.length,
    runSelectedCommand,
    setSelectedIndex,
  ]);
}

function useKeyboardCallbacks({
  handleExecute,
  matches,
  navigateBack,
  navigateInto,
  onClose,
  selectedIndex,
  stackDepth,
}: Omit<KeyboardNavOptions, 'setSelectedIndex'>): {
  handleEscape: () => void;
  openSelectedChild: () => void;
  runSelectedCommand: () => void;
} {
  const runSelectedCommand = useCallback(() => {
    const selectedCommand = matches[selectedIndex]?.command;
    if (selectedCommand) {
      void handleExecute(selectedCommand);
    }
  }, [handleExecute, matches, selectedIndex]);
  const openSelectedChild = useCallback(() => {
    const selectedCommand = matches[selectedIndex]?.command;
    if (selectedCommand && hasChildren(selectedCommand)) {
      navigateInto(selectedCommand);
    }
  }, [matches, navigateInto, selectedIndex]);
  const handleEscape = useCallback(() => {
    if (stackDepth > 0) {
      navigateBack();
      return;
    }

    onClose();
  }, [navigateBack, onClose, stackDepth]);

  return { handleEscape, openSelectedChild, runSelectedCommand };
}

function getKeyboardHandler({
  eventKey,
  handleEscape,
  matchesLength,
  openSelectedChild,
  runSelectedCommand,
  setSelectedIndex,
}: {
  eventKey: string;
  handleEscape: () => void;
  matchesLength: number;
  openSelectedChild: () => void;
  runSelectedCommand: () => void;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}): (() => void) | null {
  const handlers: Record<string, () => void> = {
    ArrowDown: () => cycleSelection(matchesLength, 1, setSelectedIndex),
    ArrowUp: () => cycleSelection(matchesLength, -1, setSelectedIndex),
    ArrowRight: openSelectedChild,
    Enter: runSelectedCommand,
    Escape: handleEscape,
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

function hasChildren(command: Command): boolean {
  return Array.isArray(command.children) && command.children.length > 0;
}
