import { useState, useEffect, useRef, useCallback } from 'react';

export interface DetailedGitStatus {
  /** Files staged in the git index: relative path -> status char (M/A/D/R) */
  staged: Map<string, string>;
  /** Unstaged working tree changes: relative path -> status char (M/A/D/?) */
  unstaged: Map<string, string>;
}

export interface UseGitStatusDetailedReturn {
  status: DetailedGitStatus;
  isRepo: boolean;
  /** Force-refresh the status (e.g. after staging/unstaging) */
  refresh: () => void;
}

const POLL_INTERVAL_MS = 3000;

const EMPTY_STATUS: DetailedGitStatus = {
  staged: new Map(),
  unstaged: new Map(),
};

function toMap(record: Record<string, string> | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!record) return map;
  for (const [key, value] of Object.entries(record)) {
    map.set(key, value);
  }
  return map;
}

/**
 * useGitStatusDetailed - polls `git status --porcelain` and returns separate
 * staged vs. unstaged file maps. Uses the `git:statusDetailed` IPC channel
 * which parses the two-column porcelain output.
 */
export function useGitStatusDetailed(projectRoot: string | null): UseGitStatusDetailedReturn {
  const [status, setStatus] = useState<DetailedGitStatus>(EMPTY_STATUS);
  const [isRepo, setIsRepo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRepoRef = useRef(false);
  const rootRef = useRef(projectRoot);
  rootRef.current = projectRoot;

  const fetchStatus = useCallback(async (root: string): Promise<void> => {
    if (!isRepoRef.current) return;
    try {
      const result = await window.electronAPI.git.statusDetailed(root);
      if (result.success) {
        setStatus({
          staged: toMap(result.staged),
          unstaged: toMap(result.unstaged),
        });
      }
    } catch {
      /* silently ignore */
    }
  }, []);

  const refresh = useCallback(() => {
    const root = rootRef.current;
    if (root && isRepoRef.current) {
      void fetchStatus(root);
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (!projectRoot) {
      setStatus(EMPTY_STATUS);
      setIsRepo(false);
      isRepoRef.current = false;
      return;
    }

    const activeRef = { current: true };

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

    // Also refresh on file changes
    let cleanupWatcher: (() => void) | null = null;
    try {
      cleanupWatcher = window.electronAPI.files.onFileChange(() => {
        if (activeRef.current && isRepoRef.current && projectRoot) {
          fetchStatus(projectRoot);
        }
      });
    } catch {
      /* ignore */
    }

    return () => {
      activeRef.current = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      cleanupWatcher?.();
    };
  }, [projectRoot, fetchStatus]);

  return { status, isRepo, refresh };
}
