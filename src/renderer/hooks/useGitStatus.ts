import { useState, useEffect, useRef, useCallback } from 'react';
import type { GitFileStatus } from '../types/electron';

export interface UseGitStatusReturn {
  /** Map of relative file path -> git status character */
  gitStatus: Map<string, GitFileStatus>;
  /** Whether the project root is inside a git repository */
  isRepo: boolean;
}

const POLL_INTERVAL_MS = 3000;

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
    } catch {
      // git not available or error — silently ignore
    }
  }, []);

  useEffect(() => {
    if (!projectRoot) {
      setGitStatus(new Map());
      setIsRepo(false);
      isRepoRef.current = false;
      return;
    }

    let active = true;

    // Check if it's a repo, then start polling
    window.electronAPI.git.isRepo(projectRoot).then((result) => {
      if (!active) return;

      const repo = !!(result.success && result.isRepo);
      setIsRepo(repo);
      isRepoRef.current = repo;

      if (repo) {
        // Initial fetch
        fetchStatus(projectRoot);

        // Start polling
        intervalRef.current = setInterval(() => {
          if (active) fetchStatus(projectRoot);
        }, POLL_INTERVAL_MS);
      }
    });

    // Also refresh on file change events
    let cleanupWatcher: (() => void) | null = null;
    try {
      cleanupWatcher = window.electronAPI.files.onFileChange(() => {
        if (active && isRepoRef.current && projectRoot) {
          fetchStatus(projectRoot);
        }
      });
    } catch {
      // file watcher not available
    }

    return () => {
      active = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      cleanupWatcher?.();
    };
  }, [projectRoot, fetchStatus]);

  return { gitStatus, isRepo };
}
