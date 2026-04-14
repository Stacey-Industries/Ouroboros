/**
 * useStartupHistory.ts — Hook for fetching persisted startup timing history.
 *
 * Calls perf:getStartupHistory on mount and exposes a `reload` callback for
 * manual refresh. Returns the last N records (default 20) from the JSONL log.
 */

import { useCallback, useEffect, useState } from 'react';

import type { StartupHistoryRecord } from '../types/electron';

const DEFAULT_LIMIT = 20;

export interface UseStartupHistoryResult {
  records: StartupHistoryRecord[];
  isLoading: boolean;
  reload: () => void;
}

export function useStartupHistory(limit = DEFAULT_LIMIT): UseStartupHistoryResult {
  const [records, setRecords] = useState<StartupHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(() => {
    setIsLoading(true);
    window.electronAPI?.perf?.getStartupHistory?.(limit)
      .then((result) => {
        if (result.success && result.records) {
          setRecords(result.records);
        }
      })
      .catch(() => { /* silent — handler may not yet be registered */ })
      .finally(() => setIsLoading(false));
  }, [limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const reload = useCallback(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { records, isLoading, reload };
}
