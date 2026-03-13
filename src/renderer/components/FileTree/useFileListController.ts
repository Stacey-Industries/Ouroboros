import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import type { FileEntry, MatchRange } from './FileListItem';

const ITEM_HEIGHT = 32;
const OVERSCAN = 5;
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'out',
  '__pycache__',
  '.git',
]);

interface DirectoryItem {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
  path: string;
}

export interface FileMatchItem {
  file: FileEntry;
  ranges?: MatchRange[];
}

export interface VisibleFileMatchItem extends FileMatchItem {
  absoluteIndex: number;
}

export interface FileListController {
  allFiles: FileEntry[];
  error: string | null;
  filteredItems: FileMatchItem[];
  focusIndex: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  query: string;
  topOffset: number;
  totalHeight: number;
  visibleItems: VisibleFileMatchItem[];
  handleKeyDown: (event: React.KeyboardEvent) => void;
  handleQueryChange: (value: string) => void;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRECTORIES.has(name);
}

function createFileEntry(root: string, itemPath: string): FileEntry {
  const absolutePath = normalizePath(itemPath);
  const relativePath = absolutePath.startsWith(root)
    ? absolutePath.slice(root.length).replace(/^\//, '')
    : absolutePath;
  const lastSlash = relativePath.lastIndexOf('/');
  const name = lastSlash === -1 ? relativePath : relativePath.slice(lastSlash + 1);
  const dir = lastSlash === -1 ? '' : relativePath.slice(0, lastSlash);

  return {
    path: itemPath,
    relativePath,
    name,
    dir,
    size: 0,
  };
}

async function collectDirectoryItem(
  root: string,
  item: DirectoryItem,
  results: FileEntry[],
): Promise<void> {
  if (item.isDirectory) {
    if (!shouldSkipDirectory(item.name)) {
      await collectFiles(root, item.path, results);
    }

    return;
  }

  if (item.isFile) {
    results.push(createFileEntry(root, item.path));
  }
}

async function collectFiles(
  root: string,
  dirPath: string,
  results: FileEntry[],
): Promise<void> {
  const result = await window.electronAPI.files.readDir(dirPath);
  if (!result.success || !result.items) {
    return;
  }

  for (const item of result.items as DirectoryItem[]) {
    await collectDirectoryItem(root, item, results);
  }
}

function sortFiles(results: FileEntry[]): FileEntry[] {
  return [...results].sort((left, right) => {
    const leftDepth = left.relativePath.split('/').length;
    const rightDepth = right.relativePath.split('/').length;

    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
}

function buildMatchRanges(
  matches: readonly Fuse.FuseResultMatch[] | undefined,
): MatchRange[] | undefined {
  if (!matches) {
    return undefined;
  }

  const ranges: MatchRange[] = [];

  for (const match of matches) {
    if (match.key !== 'name' || !match.indices) {
      continue;
    }

    for (const [start, end] of match.indices) {
      ranges.push({ start, end: end + 1 });
    }
  }

  return ranges.length > 0 ? ranges : undefined;
}

export function useFileListController({
  projectRoot,
  onFileSelect,
}: {
  projectRoot: string | null;
  onFileSelect: (filePath: string) => void;
}): FileListController {
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerHeight = useRef(400);

  useEffect(() => {
    if (!projectRoot) {
      setAllFiles([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setQuery('');
    setFocusIndex(0);

    const results: FileEntry[] = [];
    const normalizedRoot = normalizePath(projectRoot);

    collectFiles(normalizedRoot, projectRoot, results)
      .then(() => {
        if (!cancelled) {
          setAllFiles(sortFiles(results));
        }
      })
      .catch((errorValue) => {
        if (!cancelled) {
          setError(String(errorValue));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  const fuse = useMemo(
    () =>
      new Fuse(allFiles, {
        keys: ['relativePath', 'name'],
        threshold: 0.4,
        includeMatches: true,
        minMatchCharLength: 1,
      }),
    [allFiles],
  );

  const filteredItems = useMemo((): FileMatchItem[] => {
    if (!query.trim()) {
      return allFiles.map((file) => ({ file }));
    }

    return fuse.search(query).map((result) => ({
      file: result.item,
      ranges: buildMatchRanges(result.matches),
    }));
  }, [allFiles, fuse, query]);

  useEffect(() => {
    setFocusIndex((previous) => Math.min(previous, Math.max(0, filteredItems.length - 1)));
  }, [filteredItems.length]);

  useEffect(() => {
    const itemTop = focusIndex * ITEM_HEIGHT;
    const itemBottom = itemTop + ITEM_HEIGHT;
    const visibleBottom = scrollTop + containerHeight.current;

    if (itemTop < scrollTop) {
      listRef.current?.scrollTo({ top: itemTop });
    } else if (itemBottom > visibleBottom) {
      listRef.current?.scrollTo({ top: itemBottom - containerHeight.current });
    }
  }, [focusIndex, scrollTop]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusIndex((previous) => Math.min(previous + 1, filteredItems.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusIndex((previous) => Math.max(previous - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const item = filteredItems[focusIndex];
        if (item) {
          onFileSelect(item.file.path);
        }
        return;
      }

      if (event.key === 'Escape') {
        setQuery('');
        setFocusIndex(0);
      }
    },
    [filteredItems, focusIndex, onFileSelect],
  );

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setFocusIndex(0);
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    containerHeight.current = event.currentTarget.clientHeight;
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight.current / ITEM_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(filteredItems.length, visibleStart + visibleCount);
  const visibleItems = filteredItems.slice(visibleStart, visibleEnd).map((item, index) => ({
    ...item,
    absoluteIndex: visibleStart + index,
  }));

  return {
    allFiles,
    error,
    filteredItems,
    focusIndex,
    inputRef,
    isLoading,
    listRef,
    query,
    topOffset: visibleStart * ITEM_HEIGHT,
    totalHeight: filteredItems.length * ITEM_HEIGHT,
    visibleItems,
    handleKeyDown,
    handleQueryChange,
    handleScroll,
  };
}
