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

  const scanRoots = useCallback(async () => {
    if (!enabled || roots.length === 0) {
      setAllFiles([]);
      return;
    }

    const hasElectron = typeof window !== 'undefined' && 'electronAPI' in window;
    if (!hasElectron) return;

    const generation = ++generationRef.current;
    setIsIndexing(true);

    try {
      const files: FileEntry[] = [];
      const visited = new Set<string>();

      for (const root of roots) {
        await walkDirectory(root, root, files, visited, 0);
      }

      // Only update if this is still the latest scan
      if (generation === generationRef.current) {
        setAllFiles(files);
      }
    } catch {
      // Silently ignore scan errors
    } finally {
      if (generation === generationRef.current) {
        setIsIndexing(false);
      }
    }
  }, [enabled, roots]);

  useEffect(() => {
    void scanRoots();
  }, [scanRoots]);

  const refresh = useCallback(() => {
    void scanRoots();
  }, [scanRoots]);

  return useMemo(
    () => ({ allFiles, isIndexing, refresh }),
    [allFiles, isIndexing, refresh],
  );
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

async function walkDirectory(
  dirPath: string,
  rootPath: string,
  files: FileEntry[],
  visited: Set<string>,
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
  if (visited.has(dirPath)) return;
  visited.add(dirPath);

  try {
    const result = await window.electronAPI.files.readDir(dirPath);
    if (!result.success || !result.items) return;

    for (const item of result.items) {
      if (files.length >= MAX_FILES) return;

      if (item.isDirectory) {
        if (SKIP_DIRS.has(item.name)) continue;
        await walkDirectory(item.path, rootPath, files, visited, depth + 1);
      } else {
        const relativePath = item.path.replace(rootPath, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
        const parts = relativePath.split('/');
        const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

        files.push({
          path: item.path,
          relativePath,
          name: item.name,
          dir,
          size: 0, // Size unknown from readDir; can be populated lazily
        });
      }
    }
  } catch {
    // Skip directories that can't be read
  }
}
