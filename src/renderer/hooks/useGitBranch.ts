import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseGitBranchReturn {
  /** Current branch name, or null if not in a git repo / unknown */
  branch: string | null;
}

const POLL_INTERVAL_MS = 30000;
const FILE_CHANGE_DEBOUNCE_MS = 250;

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
 * useGitBranch — polls `git rev-parse --abbrev-ref HEAD` for a project root.
 *
 * - Refreshes on relevant file changes, focus/visibility regain, and a slow fallback poll.
 * - Returns the current branch name or null.
 */
export function useGitBranch(projectRoot: string | null): UseGitBranchReturn {
  const [branch, setBranch] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRepoRef = useRef(false);
  const currentRootRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  const fetchBranch = useCallback(async (root: string): Promise<void> => {
    if (!isRepoRef.current || currentRootRef.current !== root) {
      return;
    }
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    inFlightRef.current = true;
    try {
      const result = await window.electronAPI.git.branch(root);
      if (!isRepoRef.current || currentRootRef.current !== root) {
        return;
      }
      if (result.success && result.branch) {
        setBranch(result.branch);
      } else {
        setBranch(null);
      }
    } catch {
      setBranch(null);
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current && isRepoRef.current && currentRootRef.current === root) {
        pendingRef.current = false;
        void fetchBranch(root);
      }
    }
  }, []);

  const scheduleRefresh = useCallback((root: string, delayMs: number = 0): void => {
    if (!isRepoRef.current || currentRootRef.current !== root) {
      return;
    }
    clearScheduledRefresh(timeoutRef);
    if (delayMs <= 0) {
      void fetchBranch(root);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      void fetchBranch(root);
    }, delayMs);
  }, [fetchBranch]);

  useEffect(() => {
    clearPollingInterval(intervalRef);
    clearScheduledRefresh(timeoutRef);
    currentRootRef.current = projectRoot;
    isRepoRef.current = false;
    pendingRef.current = false;
    inFlightRef.current = false;
    setBranch(null);

    if (!projectRoot) {
      return;
    }

    let disposed = false;
    const cleanupWatcher = setupFileChangeWatcher(scheduleRefresh, isRepoRef, currentRootRef, projectRoot);
    const cleanupVisibility = setupVisibilityWatchers(projectRoot, scheduleRefresh, isRepoRef, currentRootRef);

    window.electronAPI.git.isRepo(projectRoot).then((result) => {
      if (disposed || currentRootRef.current !== projectRoot) return;
      if (result.success && result.isRepo) {
        isRepoRef.current = true;
        scheduleRefresh(projectRoot);
        intervalRef.current = setInterval(() => {
          if (document.visibilityState === 'visible') {
            scheduleRefresh(projectRoot);
          }
        }, POLL_INTERVAL_MS);
      }
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
  }, [projectRoot, scheduleRefresh]);

  return { branch };
}
