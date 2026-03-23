import { useCallback,useEffect, useState } from 'react';

import type { DiffLineInfo } from '../types/electron';

export interface UseGitDiffReturn {
  /** Per-line diff markers for the current file */
  diffLines: DiffLineInfo[];
  /** Whether diff data is currently loading */
  isLoading: boolean;
}

/**
 * useGitDiff — fetches git diff data for a single file.
 *
 * Runs `git diff HEAD -- <filePath>` via IPC and parses the result
 * into per-line markers (added, modified, deleted).
 * Refreshes when filePath or content changes.
 */
export function useGitDiff(
  projectRoot: string | null,
  filePath: string | null,
  content: string | null
): UseGitDiffReturn {
  const [diffLines, setDiffLines] = useState<DiffLineInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDiff = useCallback(
    async (root: string, fp: string) => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.git.diff(root, fp);
        if (result.success && result.lines) {
          setDiffLines(result.lines);
        } else {
          setDiffLines([]);
        }
      } catch {
        setDiffLines([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!projectRoot || !filePath) {
      setDiffLines([]);
      return;
    }

    fetchDiff(projectRoot, filePath);
  }, [projectRoot, filePath, content, fetchDiff]);

  return { diffLines, isLoading };
}
