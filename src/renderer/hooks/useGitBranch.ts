import { useCallback,useEffect, useRef, useState } from 'react';

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
interface GitBranchRefs {
  intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isRepoRef: React.MutableRefObject<boolean>;
  currentRootRef: React.MutableRefObject<string | null>;
  inFlightRef: React.MutableRefObject<boolean>;
  pendingRef: React.MutableRefObject<boolean>;
}

function resetGitBranchRefs(refs: GitBranchRefs, projectRoot: string | null): void {
  clearPollingInterval(refs.intervalRef);
  clearScheduledRefresh(refs.timeoutRef);
  refs.currentRootRef.current = projectRoot;
  refs.isRepoRef.current = false;
  refs.pendingRef.current = false;
  refs.inFlightRef.current = false;
}

function cleanupGitBranchEffect(refs: GitBranchRefs, projectRoot: string, cleanupWatcher: (() => void) | null, cleanupVisibility: () => void): void {
  if (refs.currentRootRef.current === projectRoot) refs.currentRootRef.current = null;
  clearPollingInterval(refs.intervalRef);
  clearScheduledRefresh(refs.timeoutRef);
  refs.pendingRef.current = false;
  refs.inFlightRef.current = false;
  cleanupWatcher?.();
  cleanupVisibility();
}

function startBranchPolling(
  refs: GitBranchRefs,
  projectRoot: string,
  scheduleRefresh: (root: string, delayMs?: number) => void,
): void {
  refs.isRepoRef.current = true;
  scheduleRefresh(projectRoot);
  refs.intervalRef.current = setInterval(() => {
    if (document.visibilityState === 'visible') scheduleRefresh(projectRoot);
  }, POLL_INTERVAL_MS);
}

async function executeBranchFetch(
  root: string,
  refs: GitBranchRefs,
  setBranch: React.Dispatch<React.SetStateAction<string | null>>,
  fetchBranch: (root: string) => Promise<void>,
): Promise<void> {
  refs.inFlightRef.current = true;
  try {
    const result = await window.electronAPI.git.branch(root);
    if (!refs.isRepoRef.current || refs.currentRootRef.current !== root) return;
    setBranch(result.success && result.branch ? result.branch : null);
  } catch {
    setBranch(null);
  } finally {
    refs.inFlightRef.current = false;
    if (refs.pendingRef.current && refs.isRepoRef.current && refs.currentRootRef.current === root) {
      refs.pendingRef.current = false;
      void fetchBranch(root);
    }
  }
}

export function useGitBranch(projectRoot: string | null): UseGitBranchReturn {
  const [branch, setBranch] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRepoRef = useRef(false);
  const currentRootRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const refsRef = useRef<GitBranchRefs>({ intervalRef, timeoutRef, isRepoRef, currentRootRef, inFlightRef, pendingRef });

  const fetchBranch = useCallback(async (root: string): Promise<void> => {
    const refs = refsRef.current;
    if (!refs.isRepoRef.current || refs.currentRootRef.current !== root) return;
    if (refs.inFlightRef.current) { refs.pendingRef.current = true; return; }
    await executeBranchFetch(root, refs, setBranch, fetchBranch);
  }, []);

  const scheduleRefresh = useCallback((root: string, delayMs: number = 0): void => {
    const refs = refsRef.current;
    if (!refs.isRepoRef.current || refs.currentRootRef.current !== root) return;
    clearScheduledRefresh(refs.timeoutRef);
    if (delayMs <= 0) { void fetchBranch(root); return; }
    refs.timeoutRef.current = setTimeout(() => { refs.timeoutRef.current = null; void fetchBranch(root); }, delayMs);
  }, [fetchBranch]);

  useEffect(() => {
    const refs = refsRef.current;
    resetGitBranchRefs(refs, projectRoot);
    setBranch(null);
    if (!projectRoot) return;

    let disposed = false;
    const cleanupWatcher = setupFileChangeWatcher(scheduleRefresh, refs.isRepoRef, refs.currentRootRef, projectRoot);
    const cleanupVisibility = setupVisibilityWatchers(projectRoot, scheduleRefresh, refs.isRepoRef, refs.currentRootRef);

    window.electronAPI.git.isRepo(projectRoot).then((result) => {
      if (disposed || refs.currentRootRef.current !== projectRoot) return;
      if (result.success && result.isRepo) startBranchPolling(refs, projectRoot, scheduleRefresh);
    });

    return () => { disposed = true; cleanupGitBranchEffect(refs, projectRoot, cleanupWatcher, cleanupVisibility); };
  }, [projectRoot, scheduleRefresh]);

  return { branch };
}
