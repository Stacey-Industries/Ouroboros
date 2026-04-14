/**
 * useThreadCheckpoints.ts — Subscribes to checkpoints for the active thread.
 *
 * Fetches the checkpoint list when the threadId changes, and re-fetches
 * when `checkpoint:change` push events arrive for the same thread.
 */

import type { SessionCheckpoint } from '@shared/types/sessionCheckpoint';
import { useCallback, useEffect, useState } from 'react';

import { useProject } from '../contexts/ProjectContext';

export interface UseThreadCheckpointsResult {
  checkpoints: SessionCheckpoint[];
  refresh: () => void;
}

export function useThreadCheckpoints(threadId: string | null): UseThreadCheckpointsResult {
  const { projectRoot } = useProject();
  const [checkpoints, setCheckpoints] = useState<SessionCheckpoint[]>([]);

  const refresh = useCallback(() => {
    if (!threadId || !projectRoot) {
      setCheckpoints([]);
      return;
    }
    void window.electronAPI.checkpoint
      .list({ threadId, projectRoot })
      .then((result) => {
        if (result.success && result.checkpoints) {
          setCheckpoints(result.checkpoints);
        }
      })
      .catch(() => {
        setCheckpoints([]);
      });
  }, [threadId, projectRoot]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!threadId) return;
    const unsub = window.electronAPI.checkpoint.onChange((changedThreadId) => {
      if (changedThreadId === threadId) refresh();
    });
    return unsub;
  }, [threadId, refresh]);

  return { checkpoints, refresh };
}
