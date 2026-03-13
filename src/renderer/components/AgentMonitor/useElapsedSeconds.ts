/**
 * useElapsedSeconds.ts — Hook for counting elapsed seconds on a pending tool call.
 */

import { useState, useEffect, useRef } from 'react';

export function useElapsedSeconds(startMs: number, active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }

    setElapsed(Math.floor((Date.now() - startMs) / 1000));

    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [startMs, active]);

  return elapsed;
}
