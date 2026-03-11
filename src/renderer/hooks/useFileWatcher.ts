import { useState, useEffect, useRef, useCallback } from 'react';
import type { DirEntry, FileChangeEvent } from '../types/electron';

export interface WatchedFile {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

export interface UseFileWatcherReturn {
  files: WatchedFile[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEBOUNCE_MS = 100;

/**
 * useFileWatcher — watches a directory for changes via the Electron preload bridge.
 *
 * - Loads the initial directory listing on mount / when dirPath changes.
 * - Subscribes to file change events and debounces rapid changes (100ms).
 * - Cleans up the watcher on unmount or when dirPath changes.
 * - Returns { files, isLoading, error, refresh }.
 */
export function useFileWatcher(dirPath: string | null): UseFileWatcherReturn {
  const [files, setFiles] = useState<WatchedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDir = useRef<string | null>(null);

  const load = useCallback(async (dir: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.files.readDir(dir);
      if (result.success && result.items) {
        setFiles(result.items.map((item: DirEntry): WatchedFile => ({
          name: item.name,
          path: item.path,
          isDirectory: item.isDirectory,
          isFile: item.isFile,
          isSymlink: item.isSymlink,
        })));
      } else {
        setError(result.error ?? 'Failed to read directory');
        setFiles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (currentDir.current) {
      await load(currentDir.current);
    }
  }, [load]);

  useEffect(() => {
    if (!dirPath) {
      setFiles([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    currentDir.current = dirPath;
    let cleanupWatcher: (() => void) | null = null;
    let active = true;

    // Initial load
    load(dirPath);

    // Start watching
    window.electronAPI.files.watchDir(dirPath).then((result) => {
      if (!active) return;
      if (!result.success) {
        console.warn('[useFileWatcher] watchDir failed:', result.error);
        return;
      }

      // Subscribe to change events
      cleanupWatcher = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
        if (!active) return;
        // Only react to changes within the watched dir
        if (!change.path.startsWith(dirPath)) return;

        // Debounce rapid filesystem events
        if (debounceTimer.current !== null) {
          clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
          if (active && currentDir.current === dirPath) {
            load(dirPath);
          }
        }, DEBOUNCE_MS);
      });
    });

    return () => {
      active = false;
      currentDir.current = null;

      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }

      cleanupWatcher?.();
      window.electronAPI.files.unwatchDir(dirPath).catch(() => {
        // Best-effort cleanup — ignore errors on unmount
      });
    };
  }, [dirPath, load]);

  return { files, isLoading, error, refresh };
}
