import { useCallback,useEffect, useRef, useState } from 'react';

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
interface GitStatusRefs {
  intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isRepoRef: React.MutableRefObject<boolean>;
  currentRootRef: React.MutableRefObject<string | null>;
  inFlightRef: React.MutableRefObject<boolean>;
  pendingRef: React.MutableRefObject<boolean>;
}

function resetGitStatusRefs(refs: GitStatusRefs, root: string | null): void {
  clearPollingInterval(refs.intervalRef);
  clearScheduledRefresh(refs.timeoutRef);
  refs.currentRootRef.current = root;
  refs.isRepoRef.current = false;
  refs.pendingRef.current = false;
  refs.inFlightRef.current = false;
}

function parseStatusResult(files: Record<string, string>): Map<string, GitFileStatus> {
  const map = new Map<string, GitFileStatus>();
  for (const [filePath, status] of Object.entries(files)) {
    map.set(filePath, status as GitFileStatus);
  }
  return map;
}

function cleanupGitStatusEffect(refs: GitStatusRefs, projectRoot: string, cleanupWatcher: (() => void) | null, cleanupVisibility: () => void): void {
  if (refs.currentRootRef.current === projectRoot) refs.currentRootRef.current = null;
  clearPollingInterval(refs.intervalRef);
  clearScheduledRefresh(refs.timeoutRef);
  refs.pendingRef.current = false;
  refs.inFlightRef.current = false;
  cleanupWatcher?.();
  cleanupVisibility();
}

async function executeStatusFetch(
  root: string,
  refs: GitStatusRefs,
  setGitStatus: React.Dispatch<React.SetStateAction<Map<string, GitFileStatus>>>,
  fetchStatus: (root: string) => Promise<void>,
): Promise<void> {
  refs.inFlightRef.current = true;
  try {
    const result = await window.electronAPI.git.status(root);
    if (!refs.isRepoRef.current || refs.currentRootRef.current !== root) return;
    if (result.success && result.files) setGitStatus(parseStatusResult(result.files));
  } catch { /* silently ignore */ }
  finally {
    refs.inFlightRef.current = false;
    if (refs.pendingRef.current && refs.isRepoRef.current && refs.currentRootRef.current === root) {
      refs.pendingRef.current = false;
      void fetchStatus(root);
    }
  }
}

interface StartStatusPollingArgs {
  refs: GitStatusRefs;
  projectRoot: string;
  scheduleRefresh: (root: string) => void;
  setIsRepo: React.Dispatch<React.SetStateAction<boolean>>;
  setGitStatus: React.Dispatch<React.SetStateAction<Map<string, GitFileStatus>>>;
  repo: boolean;
}

function startStatusPolling({
  refs, projectRoot, scheduleRefresh, setIsRepo, setGitStatus, repo,
}: StartStatusPollingArgs): void {
  setIsRepo(repo);
  refs.isRepoRef.current = repo;
  if (!repo) { setGitStatus(new Map()); return; }
  scheduleRefresh(projectRoot);
  refs.intervalRef.current = setInterval(() => {
    if (document.visibilityState === 'visible') scheduleRefresh(projectRoot);
  }, POLL_INTERVAL_MS);
}

export function useGitStatus(projectRoot: string | null, { enabled = true }: UseGitStatusOptions = {}): UseGitStatusReturn {
  const [gitStatus, setGitStatus] = useState<Map<string, GitFileStatus>>(new Map());
  const [isRepo, setIsRepo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRepoRef = useRef(false);
  const currentRootRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const refsRef = useRef<GitStatusRefs>({ intervalRef, timeoutRef, isRepoRef, currentRootRef, inFlightRef, pendingRef });

  const fetchStatus = useCallback(async (root: string): Promise<void> => {
    const refs = refsRef.current;
    if (!refs.isRepoRef.current || refs.currentRootRef.current !== root) return;
    if (refs.inFlightRef.current) { refs.pendingRef.current = true; return; }
    await executeStatusFetch(root, refs, setGitStatus, fetchStatus);
  }, []);

  const scheduleRefresh = useCallback((root: string, delayMs: number = 0): void => {
    const refs = refsRef.current;
    if (!refs.isRepoRef.current || refs.currentRootRef.current !== root) return;
    clearScheduledRefresh(refs.timeoutRef);
    if (delayMs <= 0) { void fetchStatus(root); return; }
    refs.timeoutRef.current = setTimeout(() => { refs.timeoutRef.current = null; void fetchStatus(root); }, delayMs);
  }, [fetchStatus]);

  useEffect(() => {
    const refs = refsRef.current;
    resetGitStatusRefs(refs, enabled ? projectRoot : null);
    setIsRepo(false);
    setGitStatus(new Map());
    if (!projectRoot || !enabled) return;

    let disposed = false;
    const cleanupWatcher = setupFileChangeWatcher(scheduleRefresh, refs.isRepoRef, refs.currentRootRef, projectRoot);
    const cleanupVisibility = setupVisibilityWatchers(projectRoot, scheduleRefresh, refs.isRepoRef, refs.currentRootRef);

    window.electronAPI.git.isRepo(projectRoot).then((result) => {
      if (disposed || refs.currentRootRef.current !== projectRoot) return;
      startStatusPolling({ refs, projectRoot, scheduleRefresh, setIsRepo, setGitStatus, repo: !!(result.success && result.isRepo) });
    });

    return () => { disposed = true; cleanupGitStatusEffect(refs, projectRoot, cleanupWatcher, cleanupVisibility); };
  }, [enabled, projectRoot, scheduleRefresh]);

  return { gitStatus, isRepo };
}
