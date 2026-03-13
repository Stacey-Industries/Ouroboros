import React, { useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import {
  FUSE_OPTIONS,
  buildFuseMatches,
  buildRecentMatches,
  flattenAll,
  groupByCategory,
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
    if (navStack.length === 0) {
      return commands;
    }

    return navStack[navStack.length - 1].children ?? [];
  }, [commands, navStack]);
  const matches = useMemo(() => {
    const trimmed = query.trim();

    if (trimmed !== '') {
      const searchCommands = navStack.length > 0 ? currentLevelCommands : flattenAll(commands);
      return buildFuseMatches(new Fuse(searchCommands, FUSE_OPTIONS), trimmed);
    }

    if (navStack.length > 0) {
      return currentLevelCommands
        .filter((command) => command.when === undefined || command.when())
        .map((command) => ({ command, matchIndices: [], score: 0 }));
    }

    return buildRecentMatches(commands, recentIds);
  }, [commands, currentLevelCommands, navStack, query, recentIds]);

  return { grouped: groupByCategory(matches), matches };
}
