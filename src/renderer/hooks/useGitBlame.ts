import { useState, useEffect, useCallback } from 'react';
import type { BlameLine } from '../types/electron';

export interface UseGitBlameReturn {
  /** Per-line blame data */
  blameLines: BlameLine[];
  /** Whether blame data is currently loading */
  isLoading: boolean;
}

/**
 * useGitBlame — fetches git blame data for a single file.
 *
 * Runs `git blame --porcelain <filePath>` via IPC and parses
 * into per-line blame annotations.
 */
export function useGitBlame(
  projectRoot: string | null,
  filePath: string | null,
  enabled: boolean
): UseGitBlameReturn {
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBlame = useCallback(
    async (root: string, fp: string) => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.git.blame(root, fp);
        if (result.success && result.lines) {
          setBlameLines(result.lines);
        } else {
          setBlameLines([]);
        }
      } catch {
        setBlameLines([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!enabled || !projectRoot || !filePath) {
      setBlameLines([]);
      return;
    }

    fetchBlame(projectRoot, filePath);
  }, [projectRoot, filePath, enabled, fetchBlame]);

  return { blameLines, isLoading };
}
