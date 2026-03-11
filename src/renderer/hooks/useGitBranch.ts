import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseGitBranchReturn {
  /** Current branch name, or null if not in a git repo / unknown */
  branch: string | null;
}

const POLL_INTERVAL_MS = 5000;

/**
 * useGitBranch — polls `git rev-parse --abbrev-ref HEAD` for a project root.
 *
 * - Polls every 5 seconds (branches change less frequently than file status).
 * - Returns the current branch name or null.
 */
export function useGitBranch(projectRoot: string | null): UseGitBranchReturn {
  const [branch, setBranch] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBranch = useCallback(async (root: string): Promise<void> => {
    try {
      const result = await window.electronAPI.git.branch(root);
      if (result.success && result.branch) {
        setBranch(result.branch);
      } else {
        setBranch(null);
      }
    } catch {
      setBranch(null);
    }
  }, []);

  useEffect(() => {
    if (!projectRoot) {
      setBranch(null);
      return;
    }

    let active = true;

    // Check if it's a repo first, then fetch branch
    window.electronAPI.git.isRepo(projectRoot).then((result) => {
      if (!active) return;
      if (result.success && result.isRepo) {
        fetchBranch(projectRoot);
        intervalRef.current = setInterval(() => {
          if (active) fetchBranch(projectRoot);
        }, POLL_INTERVAL_MS);
      }
    });

    return () => {
      active = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [projectRoot, fetchBranch]);

  return { branch };
}
