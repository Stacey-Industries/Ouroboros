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
export function useDiffReview(orchestrationSessionId?: string): UseDiffReviewResult {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileReviewStatus>>({});

  useEffect(() => {
    if (!orchestrationSessionId) {
      setFiles([]);
      setFileStatuses({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function loadDiffSummary(): Promise<void> {
      try {
        // TODO: Wire up to orchestration IPC when the API is available.
        // Expected IPC channel: orchestration:getDiffSummary(sessionId)
        // Expected response: { success: boolean, files: DiffFile[] }
        const api = (window as any).electronAPI?.orchestration;
        if (api?.getDiffSummary) {
          const result = await api.getDiffSummary(orchestrationSessionId);
          if (!cancelled && result?.success && Array.isArray(result.files)) {
            const loadedFiles: DiffFile[] = result.files;
            setFiles(loadedFiles);
            const statuses: Record<string, FileReviewStatus> = {};
            for (const f of loadedFiles) {
              statuses[f.path] = 'pending';
            }
            setFileStatuses(statuses);
          }
        }
        // If API doesn't exist yet, files stays empty — the component
        // won't render if there are no files.
      } catch {
        // Silently fail — diff review is optional
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDiffSummary();

    return () => {
      cancelled = true;
    };
  }, [orchestrationSessionId]);

  const acceptFile = useCallback((path: string) => {
    setFileStatuses((prev) => ({ ...prev, [path]: 'accepted' }));
  }, []);

  const rejectFile = useCallback((path: string) => {
    setFileStatuses((prev) => ({ ...prev, [path]: 'rejected' }));
  }, []);

  const acceptAll = useCallback(() => {
    setFileStatuses((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = 'accepted';
      }
      return next;
    });
  }, []);

  const rejectAll = useCallback(() => {
    setFileStatuses((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = 'rejected';
      }
      return next;
    });
  }, []);

  return { files, isLoading, fileStatuses, acceptFile, rejectFile, acceptAll, rejectAll };
}
