/**
 * useRuntimeMetrics.ts — Hook that polls perf:getRuntimeMetrics every 5s.
 *
 * Returns the latest snapshot and a `lastUpdated` timestamp (Date object)
 * so the panel can display a "last updated N seconds ago" indicator.
 */

import { useCallback, useEffect, useState } from 'react';

import type { RuntimeMetrics } from '../types/electron';

const POLL_INTERVAL_MS = 5000;

export interface UseRuntimeMetricsResult {
  metrics: RuntimeMetrics | null;
  lastUpdated: Date | null;
}

export function useRuntimeMetrics(): UseRuntimeMetricsResult {
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchMetrics = useCallback(() => {
    window.electronAPI?.perf?.getRuntimeMetrics?.()
      .then((result) => {
        if (result.success) {
          setMetrics(result.metrics ?? null);
          setLastUpdated(new Date());
        }
      })
      .catch(() => { /* silent — handler may not yet be registered */ });
  }, []);

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  return { metrics, lastUpdated };
}
