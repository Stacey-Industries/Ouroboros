import React, { useMemo, useRef, useState } from 'react';

import {
  buildRecentMatches,
  flattenAll,
  groupByCategory,
  rankCommands,
} from './commandSearch';
import type { Command, CommandMatch } from './types';

export interface CommandPaletteState {
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  navStack: Command[];
  query: string;
  selectedIndex: number;
  setNavStack: React.Dispatch<React.SetStateAction<Command[]>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function useCommandPaletteState(): CommandPaletteState {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [navStack, setNavStack] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  return {
    inputRef,
    listRef,
    navStack,
    query,
    selectedIndex,
    setNavStack,
    setQuery,
    setSelectedIndex,
  };
}

function buildSearchMatches(
  query: string,
  searchCommands: Command[],
): CommandMatch[] {
  const eligible = searchCommands.filter((c) => c.when === undefined || c.when());
  return rankCommands(eligible, query).map((r) => ({
    command: r.command,
    matchIndices: [],
    score: r.score,
    matchedField: r.matchedField,
  }));
}

function buildSubmenuMatches(currentLevelCommands: Command[]): CommandMatch[] {
  return currentLevelCommands
    .filter((command) => command.when === undefined || command.when())
    .map((command) => ({ command, matchIndices: [], score: 0 }));
}

export function useCommandPaletteData({
  commands,
  navStack,
  query,
  recentIds,
}: {
  commands: Command[];
  navStack: Command[];
  query: string;
  recentIds: string[];
}): {
  grouped: ReturnType<typeof groupByCategory>;
  matches: CommandMatch[];
} {
  const currentLevelCommands = useMemo(() => {
    if (navStack.length === 0) return commands;
    return navStack[navStack.length - 1].children ?? [];
  }, [commands, navStack]);

  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed !== '') {
      const pool = navStack.length > 0 ? currentLevelCommands : flattenAll(commands);
      return buildSearchMatches(trimmed, pool);
    }
    if (navStack.length > 0) return buildSubmenuMatches(currentLevelCommands);
    return buildRecentMatches(commands, recentIds);
  }, [commands, currentLevelCommands, navStack, query, recentIds]);

  return { grouped: groupByCategory(matches), matches };
}
