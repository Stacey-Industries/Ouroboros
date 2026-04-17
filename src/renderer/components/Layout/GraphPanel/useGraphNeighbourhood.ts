/**
 * useGraphNeighbourhood.ts — data-fetch hook for the neighbourhood pop-over.
 *
 * Calls graph:getNeighbourhood when a symbolId is provided and the feature
 * flag is on. Caches the last result so the overlay doesn't flicker when the
 * same node is selected twice.
 */

import { useEffect, useRef, useState } from 'react';

import type { GraphNeighbourhoodResult } from '../../../types/electron-graph';

export interface UseGraphNeighbourhoodOptions {
  symbolId: string | null;
  depth?: number;
  enabled: boolean;
}

export interface UseGraphNeighbourhoodResult {
  data: GraphNeighbourhoodResult | null;
  loading: boolean;
  clear: () => void;
}

// ── Fetch helper (extracted to keep hook under 40 lines) ──────────────────────

interface FetchArgs {
  symbolId: string;
  depth: number;
  cancelled: { current: boolean };
  setData: (d: GraphNeighbourhoodResult) => void;
  setLoading: (v: boolean) => void;
}

function fetchNeighbourhood({ symbolId, depth, cancelled, setData, setLoading }: FetchArgs): void {
  window.electronAPI.graph
    .getNeighbourhood(symbolId, depth)
    .then((result) => { if (!cancelled.current) setData(result); })
    .catch(() => {
      if (!cancelled.current) setData({ success: false, error: 'Failed to load neighbourhood' });
    })
    .finally(() => { if (!cancelled.current) setLoading(false); });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGraphNeighbourhood({ symbolId, depth = 1, enabled }: UseGraphNeighbourhoodOptions): UseGraphNeighbourhoodResult {
  const [data, setData] = useState<GraphNeighbourhoodResult | null>(null);
  const [loading, setLoading] = useState(false);
  const lastIdRef = useRef<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !symbolId) {
      setData(null);
      setLoading(false);
      lastIdRef.current = null;
      return;
    }
    if (symbolId === lastIdRef.current) return;
    lastIdRef.current = symbolId;
    cancelRef.current = false;
    setLoading(true);
    fetchNeighbourhood({ symbolId, depth, cancelled: cancelRef, setData, setLoading });
    return () => { cancelRef.current = true; };
  }, [symbolId, depth, enabled]);

  const clear = () => {
    cancelRef.current = true;
    setData(null);
    setLoading(false);
    lastIdRef.current = null;
  };

  return { data, loading, clear };
}
