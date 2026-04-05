import { useCallback, useEffect, useState } from 'react';

import type { RouterStatsResult } from '../types/electron-workspace';

const POLL_INTERVAL_MS = 60_000;

interface UseRouterStatsResult {
  stats: RouterStatsResult | null;
  loading: boolean;
  refresh: () => void;
}

async function fetchStats(): Promise<RouterStatsResult | null> {
  try {
    const result = await window.electronAPI.router.getStats();
    return result.success ? (result.data ?? null) : null;
  } catch {
    return null;
  }
}

export function useRouterStats(): UseRouterStatsResult {
  const [stats, setStats] = useState<RouterStatsResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    void fetchStats().then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { stats, loading, refresh };
}
