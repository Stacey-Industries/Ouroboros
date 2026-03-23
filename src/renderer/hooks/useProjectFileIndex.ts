import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FileEntry } from '../components/FileTree/FileListItem';

export interface UseProjectFileIndexOptions {
  roots: string[];
  enabled: boolean;
}

export interface UseProjectFileIndexResult {
  /** All files discovered in the project roots */
  allFiles: FileEntry[];
  /** Whether the index is currently being built */
  isIndexing: boolean;
  /** Re-scan the project roots */
  refresh: () => void;
}

/**
 * Maintains an in-memory index of all files under the given project roots.
 * Uses `files:readDir` IPC to walk directories recursively.
 *
 * The index is rebuilt when roots change or when `refresh` is called.
 */
export function useProjectFileIndex({
  roots,
  enabled,
}: UseProjectFileIndexOptions): UseProjectFileIndexResult {
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const generationRef = useRef(0);

  // Stabilize roots array reference — callers often pass inline `[projectRoot]`
  // which creates a new array every render, causing infinite re-scan loops.
  const rootsKey = roots.join('\0');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableRoots = useMemo(() => roots, [rootsKey]);

  const scanRoots = useCallback(async () => {
    if (!enabled || stableRoots.length === 0) { setAllFiles([]); return; }
    const hasElectron = typeof window !== 'undefined' && 'electronAPI' in window;
    if (!hasElectron) return;

    const generation = ++generationRef.current;
    setIsIndexing(true);
    try {
      const files = await collectAllFiles(stableRoots);
      if (generation === generationRef.current) setAllFiles(files);
    } catch { /* silently ignore */ }
    finally { if (generation === generationRef.current) setIsIndexing(false); }
  }, [enabled, stableRoots]);

  useEffect(() => { void scanRoots(); }, [scanRoots]);

  const refresh = useCallback(() => { void scanRoots(); }, [scanRoots]);

  return useMemo(() => ({ allFiles, isIndexing, refresh }), [allFiles, isIndexing, refresh]);
}

async function collectAllFiles(roots: string[]): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  const visited = new Set<string>();
  for (const root of roots) {
    await walkDirectory({ dirPath: root, rootPath: root, files, visited, depth: 0 });
  }
  return files;
}

const MAX_DEPTH = 8;
const MAX_FILES = 5000;

// Directories to skip during indexing
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  '.cache',
  '__pycache__',
  '.tox',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.svelte-kit',
]);

interface WalkOptions {
  dirPath: string;
  rootPath: string;
  files: FileEntry[];
  visited: Set<string>;
  depth: number;
}

function toFileEntry(itemPath: string, itemName: string, rootPath: string): FileEntry {
  const relativePath = itemPath.replace(rootPath, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
  const parts = relativePath.split('/');
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  return { path: itemPath, relativePath, name: itemName, dir, size: 0 };
}

async function walkItems(items: Array<{ path: string; name: string; isDirectory: boolean }>, opts: WalkOptions): Promise<void> {
  for (const item of items) {
    if (opts.files.length >= MAX_FILES) return;
    if (item.isDirectory && !SKIP_DIRS.has(item.name)) {
      await walkDirectory({ ...opts, dirPath: item.path, depth: opts.depth + 1 });
    } else if (!item.isDirectory) {
      opts.files.push(toFileEntry(item.path, item.name, opts.rootPath));
    }
  }
}

async function walkDirectory(opts: WalkOptions): Promise<void> {
  if (opts.depth > MAX_DEPTH || opts.files.length >= MAX_FILES) return;
  if (opts.visited.has(opts.dirPath)) return;
  opts.visited.add(opts.dirPath);

  try {
    const result = await window.electronAPI.files.readDir(opts.dirPath);
    if (!result.success || !result.items) return;
    await walkItems(result.items, opts);
  } catch { /* skip unreadable dirs */ }
}
