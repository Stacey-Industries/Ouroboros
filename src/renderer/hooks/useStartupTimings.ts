/**
 * useStartupTimings.ts — Hook for fetching startup phase timing marks.
 *
 * Polls every 5 seconds until all 7 expected marks are present, then stops.
 * `isComplete` gates the "all timings collected" state (7 phases minimum).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { StartupMark } from '../types/electron';

const EXPECTED_PHASE_COUNT = 7;
const POLL_INTERVAL_MS = 5000;

export interface UseStartupTimingsResult {
  timings: StartupMark[];
  isComplete: boolean;
  reload: () => void;
}

export function useStartupTimings(): UseStartupTimingsResult {
  const [timings, setTimings] = useState<StartupMark[]>([]);
  const isComplete = timings.length >= EXPECTED_PHASE_COUNT;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTimings = useCallback(() => {
    window.electronAPI?.perf?.getStartupTimings?.()
      .then((result) => {
        if (result.success && result.timings) {
          setTimings(result.timings);
        }
      })
      .catch(() => { /* silent — handler may not yet be registered */ });
  }, []);

  useEffect(() => {
    fetchTimings();

    intervalRef.current = setInterval(() => {
      setTimings((prev) => {
        if (prev.length >= EXPECTED_PHASE_COUNT) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return prev;
        }
        return prev;
      });
      fetchTimings();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchTimings]);

  const reload = useCallback(() => {
    fetchTimings();
  }, [fetchTimings]);

  return { timings, isComplete, reload };
}
