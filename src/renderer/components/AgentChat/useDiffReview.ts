import { useCallback, useEffect, useState } from 'react';

import type { DiffFile } from './AgentChatDiffReview';

type FileReviewStatus = 'pending' | 'accepted' | 'rejected';

export interface UseDiffReviewResult {
  files: DiffFile[];
  isLoading: boolean;
  fileStatuses: Record<string, FileReviewStatus>;
  acceptFile: (path: string) => void;
  rejectFile: (path: string) => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

/**
 * Hook for managing diff review state for an orchestration session.
 *
 * Loads the diff summary from orchestration IPC when available, otherwise
 * provides an empty file list. Tracks per-file accept/reject status.
 */
type DiffSummaryApi = { getDiffSummary?: (id: string) => Promise<{ success: boolean; files?: DiffFile[] }> };

function getDiffSummaryApi(): DiffSummaryApi | undefined {
  return (window as unknown as { electronAPI?: { orchestration?: DiffSummaryApi } }).electronAPI?.orchestration;
}

function buildInitialStatuses(loadedFiles: DiffFile[]): Record<string, FileReviewStatus> {
  const statuses: Record<string, FileReviewStatus> = {};
  for (const f of loadedFiles) statuses[f.path] = 'pending';
  return statuses;
}

interface DiffFetchCallbacks {
  setFiles: (f: DiffFile[]) => void;
  setFileStatuses: (s: Record<string, FileReviewStatus>) => void;
  setIsLoading: (b: boolean) => void;
}

async function fetchDiffSummary(
  sessionId: string,
  cancelled: { current: boolean },
  callbacks: DiffFetchCallbacks,
): Promise<void> {
  try {
    const api = getDiffSummaryApi();
    if (!api?.getDiffSummary) return;
    const result = await api.getDiffSummary(sessionId);
    if (cancelled.current) return;
    if (result?.success && Array.isArray(result.files)) {
      callbacks.setFiles(result.files);
      callbacks.setFileStatuses(buildInitialStatuses(result.files));
    }
  } catch {
    // Silently fail — diff review is optional
  } finally {
    if (!cancelled.current) callbacks.setIsLoading(false);
  }
}

function useDiffLoad(
  orchestrationSessionId: string | undefined,
  setFiles: (f: DiffFile[]) => void,
  setFileStatuses: (s: Record<string, FileReviewStatus>) => void,
  setIsLoading: (b: boolean) => void,
): void {
  useEffect(() => {
    if (!orchestrationSessionId) {
      setFiles([]);
      setFileStatuses({});
      return;
    }
    const cancelled = { current: false };
    setIsLoading(true);
    void fetchDiffSummary(orchestrationSessionId, cancelled, { setFiles, setFileStatuses, setIsLoading });
    return () => { cancelled.current = true; };
  }, [orchestrationSessionId, setFiles, setFileStatuses, setIsLoading]);
}

function useFileStatusActions(setFileStatuses: (updater: (prev: Record<string, FileReviewStatus>) => Record<string, FileReviewStatus>) => void) {
  const acceptFile = useCallback((path: string) => {
    setFileStatuses((prev) => ({ ...prev, [path]: 'accepted' }));
  }, [setFileStatuses]);

  const rejectFile = useCallback((path: string) => {
    setFileStatuses((prev) => ({ ...prev, [path]: 'rejected' }));
  }, [setFileStatuses]);

  const acceptAll = useCallback(() => {
    setFileStatuses((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = 'accepted';
      return next;
    });
  }, [setFileStatuses]);

  const rejectAll = useCallback(() => {
    setFileStatuses((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = 'rejected';
      return next;
    });
  }, [setFileStatuses]);

  return { acceptFile, rejectFile, acceptAll, rejectAll };
}

export function useDiffReview(orchestrationSessionId?: string): UseDiffReviewResult {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileReviewStatus>>({});

  useDiffLoad(orchestrationSessionId, setFiles, setFileStatuses, setIsLoading);
  const actions = useFileStatusActions(setFileStatuses);

  return { files, isLoading, fileStatuses, ...actions };
}
