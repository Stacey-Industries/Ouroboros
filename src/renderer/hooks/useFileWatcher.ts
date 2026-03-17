import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { DirEntry, FileChangeEvent } from '../types/electron';
import { subscribeToDirectoryChanges } from './directoryWatchRegistry';

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
const noop = (): void => { };

type TimerRef = MutableRefObject<ReturnType<typeof setTimeout> | null>;
type CleanupWatcher = () => void;

interface FileWatcherState {
  setFiles: Dispatch<SetStateAction<WatchedFile[]>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

interface DirectoryWatcherSetupOptions {
  dirPath: string | null;
  currentDir: MutableRefObject<string | null>;
  debounceTimer: TimerRef;
  load: (dir: string) => Promise<void>;
  state: FileWatcherState;
}

interface DirectoryWatchStartOptions {
  dirPath: string;
  currentDir: MutableRefObject<string | null>;
  debounceTimer: TimerRef;
  load: (dir: string) => Promise<void>;
  isActive: () => boolean;
}

function toWatchedFile(item: DirEntry): WatchedFile {
  return {
    name: item.name,
    path: item.path,
    isDirectory: item.isDirectory,
    isFile: item.isFile,
    isSymlink: item.isSymlink,
  };
}

function resetFileWatcherState({ setFiles, setIsLoading, setError }: FileWatcherState): void {
  setFiles([]);
  setError(null);
  setIsLoading(false);
}

function clearDebounceTimer(debounceTimer: TimerRef): void {
  if (debounceTimer.current === null) {
    return;
  }

  clearTimeout(debounceTimer.current);
  debounceTimer.current = null;
}

async function loadWatchedDirectory(dir: string, { setFiles, setIsLoading, setError }: FileWatcherState): Promise<void> {
  setIsLoading(true);
  setError(null);

  try {
    const result = await window.electronAPI.files.readDir(dir);
    if (result.success && result.items) {
      setFiles(result.items.map(toWatchedFile));
      return;
    }

    setError(result.error ?? 'Failed to read directory');
    setFiles([]);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    setFiles([]);
  } finally {
    setIsLoading(false);
  }
}

function scheduleDirectoryReload(options: DirectoryWatchStartOptions): void {
  clearDebounceTimer(options.debounceTimer);
  options.debounceTimer.current = setTimeout(() => {
    if (!options.isActive() || options.currentDir.current !== options.dirPath) {
      return;
    }

    void options.load(options.dirPath);
  }, DEBOUNCE_MS);
}

function isRelevantFileChange(change: FileChangeEvent, dirPath: string): boolean {
  return change.path.startsWith(dirPath);
}

async function startDirectoryWatcher(options: DirectoryWatchStartOptions): Promise<CleanupWatcher> {
  try {
    if (!options.isActive()) {
      return noop;
    }

    return subscribeToDirectoryChanges(options.dirPath, (change: FileChangeEvent) => {
      if (!options.isActive() || !isRelevantFileChange(change, options.dirPath)) {
        return;
      }

      scheduleDirectoryReload(options);
    });
  } catch (error) {
    if (options.isActive()) {
      console.warn('[useFileWatcher] watchDir error:', error);
    }

    return noop;
  }
}

function stopDirectoryWatcher(
  cleanupWatcher: CleanupWatcher,
  currentDir: MutableRefObject<string | null>,
  debounceTimer: TimerRef,
): void {
  currentDir.current = null;
  clearDebounceTimer(debounceTimer);
  cleanupWatcher();
}

function setupDirectoryWatcher(options: DirectoryWatcherSetupOptions): CleanupWatcher {
  if (!options.dirPath) {
    options.currentDir.current = null;
    clearDebounceTimer(options.debounceTimer);
    resetFileWatcherState(options.state);
    return noop;
  }

  options.currentDir.current = options.dirPath;
  let active = true;
  let cleanupWatcher: CleanupWatcher = noop;

  void options.load(options.dirPath);
  void startDirectoryWatcher({
    dirPath: options.dirPath,
    currentDir: options.currentDir,
    debounceTimer: options.debounceTimer,
    load: options.load,
    isActive: () => active,
  }).then((cleanup) => {
    if (active) {
      cleanupWatcher = cleanup;
    }
  });

  return () => {
    active = false;
    stopDirectoryWatcher(cleanupWatcher, options.currentDir, options.debounceTimer);
  };
}

/**
 * useFileWatcher watches a directory for changes via the Electron preload bridge.
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

  const load = useCallback(
    (dir: string): Promise<void> => loadWatchedDirectory(dir, { setFiles, setIsLoading, setError }),
    [],
  );
  const refresh = useCallback(async (): Promise<void> => {
    if (currentDir.current) {
      await load(currentDir.current);
    }
  }, [load]);

  useEffect(
    () => setupDirectoryWatcher({
      dirPath,
      currentDir,
      debounceTimer,
      load,
      state: { setFiles, setIsLoading, setError },
    }),
    [dirPath, load],
  );

  return { files, isLoading, error, refresh };
}
