/**
 * FilePicker.hooks.ts — keyboard, scroll, and selection hooks extracted to stay under line limit.
 */

import Fuse from 'fuse.js';
import React, { useCallback, useEffect, useMemo } from 'react';

import type { FileEntry } from '../FileTree/FileListItem';

export type MatchResult = {
  entry: FileEntry;
  nameIndices: ReadonlyArray<readonly [number, number]>;
  pathIndices: ReadonlyArray<readonly [number, number]>;
};

export type PickerKeyboardConfig = {
  matches: MatchResult[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  handleSelect: (entry: FileEntry) => void;
  onClose: () => void;
};

const MAX_RESULTS = 30;

export const FUSE_OPTIONS = {
  keys: [
    { name: 'name', weight: 0.6 },
    { name: 'relativePath', weight: 0.4 },
  ],
  threshold: 0.4,
  distance: 200,
  minMatchCharLength: 1,
  includeScore: true,
  includeMatches: true,
};

export function useFileMatches(
  query: string,
  fuse: Fuse<FileEntry>,
  allFiles: FileEntry[],
): MatchResult[] {
  return useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      return allFiles.slice(0, MAX_RESULTS).map((entry) => ({
        entry,
        nameIndices: [] as ReadonlyArray<readonly [number, number]>,
        pathIndices: [] as ReadonlyArray<readonly [number, number]>,
      }));
    }
    return fuse.search(trimmed, { limit: MAX_RESULTS }).map((result) => ({
      entry: result.item,
      nameIndices: (result.matches?.find((m) => m.key === 'name')?.indices ??
        []) as ReadonlyArray<readonly [number, number]>,
      pathIndices: (result.matches?.find((m) => m.key === 'relativePath')?.indices ??
        []) as ReadonlyArray<readonly [number, number]>,
    }));
  }, [query, fuse, allFiles]);
}

export function useClampIndex(
  length: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): void {
  useEffect(() => {
    setSelectedIndex((prev) => (length === 0 ? 0 : Math.min(prev, length - 1)));
  }, [length, setSelectedIndex]);
}

export function useScrollIntoView(listElement: HTMLDivElement | null, selectedIndex: number): void {
  useEffect(() => {
    const item = listElement?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [listElement, selectedIndex]);
}

export function useFileSelection(
  onClose: () => void,
  onSelectFile: (filePath: string) => void,
): (entry: FileEntry) => void {
  return useCallback(
    (entry: FileEntry) => {
      onClose();
      onSelectFile(entry.path);
    },
    [onClose, onSelectFile],
  );
}

export function useQueryChange(
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
): (value: string) => void {
  return useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIndex(0);
    },
    [setQuery, setSelectedIndex],
  );
}

export function usePickerKeyboard({
  matches,
  selectedIndex,
  setSelectedIndex,
  handleSelect,
  onClose,
}: PickerKeyboardConfig): (event: React.KeyboardEvent<HTMLInputElement>) => void {
  return useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const length = matches.length;
      const handlers: Record<string, () => void> = {
        ArrowDown: () => setSelectedIndex((prev) => (length === 0 ? 0 : (prev + 1) % length)),
        ArrowUp: () =>
          setSelectedIndex((prev) => (length === 0 ? 0 : (prev - 1 + length) % length)),
        Enter: () => {
          if (matches[selectedIndex]) handleSelect(matches[selectedIndex].entry);
        },
        Escape: () => onClose(),
      };
      const handler = handlers[event.key];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
    [matches, selectedIndex, setSelectedIndex, handleSelect, onClose],
  );
}

export function getFooterHints(fileCount: number, actionLabel: string): string[] {
  const hints = ['↑↓ navigate', `↵ ${actionLabel}`, 'esc close'];
  return fileCount > 0 ? [...hints, `${fileCount} files`] : hints;
}

export function getEmptyLabel(
  projectRoot: string | null,
  isScanning: boolean,
  query: string,
): string {
  if (!projectRoot) return 'No project open';
  if (isScanning) return 'Scanning project files...';
  if (query.trim()) return 'No files matched';
  return 'No files found';
}
