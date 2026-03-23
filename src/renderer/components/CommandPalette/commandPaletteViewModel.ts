import React from 'react';

import type { CommandPaletteActions } from './commandPaletteActions';
import { groupByCategory } from './commandSearch';
import type { Command } from './types';

const ROOT_FOOTER_HINTS = [
  '\u2191\u2193 navigate',
  '\u21b5 execute',
  'esc close',
  '\u2192 open submenu',
];

const SUBMENU_FOOTER_HINTS = [
  '\u2191\u2193 navigate',
  '\u21b5 execute',
  'esc back',
];

type BuildCommandPaletteModelOptions = {
  actions: CommandPaletteActions;
  grouped: ReturnType<typeof groupByCategory>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: ReturnType<typeof groupByCategory>[number]['matches'];
  navStack: Command[];
  query: string;
  recentCount: number;
  selectedIndex: number;
};

export function buildCommandPaletteModel({
  actions,
  grouped,
  inputRef,
  listRef,
  matches,
  navStack,
  query,
  recentCount,
  selectedIndex,
}: BuildCommandPaletteModelOptions) {
  return {
    emptyLabel: getEmptyLabel(query, navStack.length, recentCount),
    footerHints: navStack.length > 0 ? SUBMENU_FOOTER_HINTS : ROOT_FOOTER_HINTS,
    grouped,
    handleExecute: actions.handleExecute,
    handleKeyDown: actions.handleKeyDown,
    handleMouseEnter: actions.handleMouseEnter,
    handleQueryChange: actions.handleQueryChange,
    inputRef,
    listRef,
    matches,
    navigateBack: actions.navigateBack,
    navStack,
    placeholder: getPlaceholder(navStack),
    query,
    selectedId: matches[selectedIndex]?.command.id,
    selectedIndex,
    showHeaders: query.trim() !== '' && grouped.length >= 2 && navStack.length === 0,
  };
}

function getPlaceholder(navStack: Command[]): string {
  if (navStack.length === 0) {
    return 'Type a command...';
  }

  return `Search in ${navStack[navStack.length - 1].label}...`;
}

function getEmptyLabel(query: string, stackDepth: number, recentCount: number): string {
  if (query.trim() !== '') {
    return 'No commands matched';
  }

  if (stackDepth > 0) {
    return 'No commands in this menu';
  }

  return recentCount === 0 ? 'Type to search commands' : 'No recent commands';
}
