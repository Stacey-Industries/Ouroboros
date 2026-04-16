/**
 * useDashboardData — fetches global cost rollup and per-thread breakdowns.
 *
 * Manages time-range state, IPC calls, and loading/error tracking
 * for the UsageDashboard panel.
 */

import { useCallback, useEffect, useState } from 'react';

import type {
  GlobalCostRollupRecord,
  ThreadCostRollupRecord,
} from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimeRangeKey = '7d' | '30d' | 'all';

export interface DashboardData {
  rollup: GlobalCostRollupRecord | null;
  threads: ThreadCostRollupRecord[];
  loading: boolean;
  error: string | null;
  timeRange: TimeRangeKey;
  setTimeRange: (range: TimeRangeKey) => void;
  refresh: () => void;
}

// ─── Time range helpers ───────────────────────────────────────────────────────

function buildTimeRangeParam(
  key: TimeRangeKey,
): { from: number; to: number } | undefined {
  if (key === 'all') return undefined;
  const now = Date.now();
  const days = key === '7d' ? 7 : 30;
  return { from: now - days * 24 * 60 * 60 * 1000, to: now };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardData(): DashboardData {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all');
  const [rollup, setRollup] = useState<GlobalCostRollupRecord | null>(null);
  const [threads, setThreads] = useState<ThreadCostRollupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const payload = { timeRange: buildTimeRangeParam(timeRange) };
    void window.electronAPI.agentChat
      .getGlobalCostRollup(payload)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setError(result.error ?? 'Failed to load usage data');
          return;
        }
        setRollup(result.rollup ?? null);
        setThreads(result.threads ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [timeRange, rev]);

  return { rollup, threads, loading, error, timeRange, setTimeRange, refresh };
}
