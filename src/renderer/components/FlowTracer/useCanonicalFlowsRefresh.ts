/**
 * useCanonicalFlowsRefresh.ts — React hook for triggering gallery regeneration.
 *
 * Wave 85 Phase 5. Exposes a `refresh()` action that calls
 * window.electronAPI.flowTracer.regenerateGallery() and tracks loading state.
 * Intended for the gallery header "Refresh" button in FlowGallery.tsx.
 */

import { useCallback, useState } from 'react';

export interface UseCanonicalFlowsRefreshResult {
  /** True while a regeneration call is in-flight. */
  isRefreshing: boolean;
  /** Last error message from a failed regeneration, or null. */
  refreshError: string | null;
  /** Trigger gallery regeneration. Resolves when the CLI call completes. */
  refresh: () => Promise<void>;
}

/**
 * Hook that provides a `refresh` action to force-regenerate the canonical
 * flow gallery via the flowTracer:regenerate-gallery IPC channel.
 *
 * Usage:
 *   const { isRefreshing, refresh } = useCanonicalFlowsRefresh();
 *   <button onClick={refresh} disabled={isRefreshing}>Refresh gallery</button>
 */
export function useCanonicalFlowsRefresh(): UseCanonicalFlowsRefreshResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const result = await window.electronAPI.flowTracer.regenerateGallery();
      if (!result.success) {
        setRefreshError(result.error ?? 'Gallery regeneration failed');
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { isRefreshing, refreshError, refresh };
}
