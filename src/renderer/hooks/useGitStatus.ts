import { useState, useEffect, useRef, useCallback } from 'react';
import type { GitFileStatus } from '../types/electron';

export interface UseGitStatusReturn {
  /** Map of relative file path -> git status character */
  gitStatus: Map<string, GitFileStatus>;
  /** Whether the project root is inside a git repository */
  isRepo: boolean;
}

interface UseGitStatusOptions {
  enabled?: boolean;
}

const POLL_INTERVAL_MS = 8000;
const FILE_CHANGE_DEBOUNCE_MS = 150;

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isPathInsideRoot(filePath: string, projectRoot: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedRoot = normalizePath(projectRoot);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function clearPollingInterval(
  intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
): void {
  if (intervalRef.current !== null) {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
}

function clearScheduledRefresh(
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  if (timeoutRef.current !== null) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

function setupFileChangeWatcher(
  scheduleRefresh: (root: string, delayMs?: number) => void,
  isRepoRef: React.MutableRefObject<boolean>,
  currentRootRef: React.MutableRefObject<string | null>,
  projectRoot: string,
): (() => void) | null {
  try {
    return window.electronAPI.files.onFileChange((change) => {
      if (!isRepoRef.current || currentRootRef.current !== projectRoot) {
        return;
      }
      if (!isPathInsideRoot(change.path, projectRoot)) {
        return;
      }
      scheduleRefresh(projectRoot, FILE_CHANGE_DEBOUNCE_MS);
    });
  } catch {
    return null;
  }
}

function setupVisibilityWatchers(
  projectRoot: string,
  scheduleRefresh: (root: string, delayMs?: number) => void,
  isRepoRef: React.MutableRefObject<boolean>,
  currentRootRef: React.MutableRefObject<string | null>,
): () => void {
  const refreshVisibleState = () => {
    if (!isRepoRef.current || currentRootRef.current !== projectRoot) {
      return;
    }
    scheduleRefresh(projectRoot);
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      refreshVisibleState();
    }
  };

  window.addEventListener('focus', refreshVisibleState);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('focus', refreshVisibleState);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * useGitStatus — polls `git status --porcelain` for a project root.
 *
 * - Checks if the directory is a git repo on mount.
 * - Polls every 8 seconds and on file change events.
 * - Returns a Map<relativePath, GitFileStatus> for each dirty file.
 */
export function useGitStatus(projectRoot: string | null, { enabled = true }: UseGitStatusOptions = {}): UseGitStatusReturn {
  const [gitStatus, setGitStatus] = useState<Map<string, GitFileStatus>>(new Map());
  const [isRepo, setIsRepo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRepoRef = useRef(false);
  const currentRootRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  const fetchStatus = useCallback(async (root: string): Promise<void> => {
    if (!isRepoRef.current || currentRootRef.current !== root) return;
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    inFlightRef.current = true;
    try {
      const result = await window.electronAPI.git.status(root);
      if (!isRepoRef.current || currentRootRef.current !== root) {
        return;
      }
      if (result.success && result.files) {
        const map = new Map<string, GitFileStatus>();
        for (const [filePath, status] of Object.entries(result.files)) {
          map.set(filePath, status as GitFileStatus);
        }
        setGitStatus(map);
      }
    } catch { /* silently ignore */ }
    finally {
      inFlightRef.current = false;
      if (pendingRef.current && isRepoRef.current && currentRootRef.current === root) {
        pendingRef.current = false;
        void fetchStatus(root);
      }
    }
  }, []);

  const scheduleRefresh = useCallback((root: string, delayMs: number = 0): void => {
    if (!isRepoRef.current || currentRootRef.current !== root) {
      return;
    }
    clearScheduledRefresh(timeoutRef);
    if (delayMs <= 0) {
      void fetchStatus(root);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      void fetchStatus(root);
    }, delayMs);
  }, [fetchStatus]);

  useEffect(() => {
    clearPollingInterval(intervalRef);
    clearScheduledRefresh(timeoutRef);
    currentRootRef.current = enabled ? projectRoot : null;
    isRepoRef.current = false;
    pendingRef.current = false;
    inFlightRef.current = false;
    setIsRepo(false);
    setGitStatus(new Map());

    if (!projectRoot || !enabled) {
      return;
    }

    let disposed = false;
    const cleanupWatcher = setupFileChangeWatcher(scheduleRefresh, isRepoRef, currentRootRef, projectRoot);
    const cleanupVisibility = setupVisibilityWatchers(projectRoot, scheduleRefresh, isRepoRef, currentRootRef);

    window.electronAPI.git.isRepo(projectRoot).then((result) => {
      if (disposed || currentRootRef.current !== projectRoot) return;

      const repo = !!(result.success && result.isRepo);
      setIsRepo(repo);
      isRepoRef.current = repo;

      if (!repo) {
        setGitStatus(new Map());
        return;
      }

      scheduleRefresh(projectRoot);
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          scheduleRefresh(projectRoot);
        }
      }, POLL_INTERVAL_MS);
    });

    return () => {
      disposed = true;
      if (currentRootRef.current === projectRoot) {
        currentRootRef.current = null;
      }
      clearPollingInterval(intervalRef);
      clearScheduledRefresh(timeoutRef);
      pendingRef.current = false;
      inFlightRef.current = false;
      cleanupWatcher?.();
      cleanupVisibility();
    };
  }, [enabled, projectRoot, scheduleRefresh]);

  return { gitStatus, isRepo };
}
