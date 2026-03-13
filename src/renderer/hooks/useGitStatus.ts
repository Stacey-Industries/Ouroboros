import { useState, useEffect, useRef, useCallback } from 'react';
import type { GitFileStatus } from '../types/electron';

export interface UseGitStatusReturn {
  /** Map of relative file path -> git status character */
  gitStatus: Map<string, GitFileStatus>;
  /** Whether the project root is inside a git repository */
  isRepo: boolean;
}

const POLL_INTERVAL_MS = 3000;

function setupFileChangeWatcher(
  fetchStatus: (root: string) => void,
  isRepoRef: React.MutableRefObject<boolean>,
  projectRoot: string,
  activeRef: { current: boolean },
): (() => void) | null {
  try {
    return window.electronAPI.files.onFileChange(() => {
      if (activeRef.current && isRepoRef.current && projectRoot) {
        fetchStatus(projectRoot);
      }
    });
  } catch {
    return null;
  }
}

interface RepoPollingRefs {
  isRepoRef: React.MutableRefObject<boolean>;
  intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  activeRef: { current: boolean };
}

function startRepoPolling(
  projectRoot: string,
  fetchStatus: (root: string) => void,
  setIsRepo: (v: boolean) => void,
  refs: RepoPollingRefs,
): void {
  const { isRepoRef, intervalRef, activeRef } = refs;
  window.electronAPI.git.isRepo(projectRoot).then((result) => {
    if (!activeRef.current) return;

    const repo = !!(result.success && result.isRepo);
    setIsRepo(repo);
    isRepoRef.current = repo;

    if (repo) {
      fetchStatus(projectRoot);
      intervalRef.current = setInterval(() => {
        if (activeRef.current) fetchStatus(projectRoot);
      }, POLL_INTERVAL_MS);
    }
  });
}

/**
 * useGitStatus — polls `git status --porcelain` for a project root.
 *
 * - Checks if the directory is a git repo on mount.
 * - Polls every 3 seconds and on file change events.
 * - Returns a Map<relativePath, GitFileStatus> for each dirty file.
 */
export function useGitStatus(projectRoot: string | null): UseGitStatusReturn {
  const [gitStatus, setGitStatus] = useState<Map<string, GitFileStatus>>(new Map());
  const [isRepo, setIsRepo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRepoRef = useRef(false);

  const fetchStatus = useCallback(async (root: string): Promise<void> => {
    if (!isRepoRef.current) return;
    try {
      const result = await window.electronAPI.git.status(root);
      if (result.success && result.files) {
        const map = new Map<string, GitFileStatus>();
        for (const [filePath, status] of Object.entries(result.files)) {
          map.set(filePath, status as GitFileStatus);
        }
        setGitStatus(map);
      }
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    if (!projectRoot) {
      setGitStatus(new Map());
      setIsRepo(false);
      isRepoRef.current = false;
      return;
    }

    const activeRef = { current: true };
    startRepoPolling(projectRoot, fetchStatus, setIsRepo, { isRepoRef, intervalRef, activeRef });
    const cleanupWatcher = setupFileChangeWatcher(fetchStatus, isRepoRef, projectRoot, activeRef);

    return () => {
      activeRef.current = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      cleanupWatcher?.();
    };
  }, [projectRoot, fetchStatus]);

  return { gitStatus, isRepo };
}
