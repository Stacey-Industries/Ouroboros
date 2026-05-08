/**
 * useNLResolve.ts — Renderer hook for natural-language → symbol resolution.
 *
 * Wave 85 Phase 6. Wraps the flowTracer:resolve-natural-language IPC call
 * behind a typed state machine so FlowSearchBar can drive its UI states
 * without wiring IPC directly.
 *
 * State machine:
 *   idle → loading (on resolveQuery call)
 *   loading → resolved   (confidence > 0.8, single direct match)
 *   loading → disambiguation (confidence ≤ 0.8, top-5 shown)
 *   loading → error      (IPC failure or success:false)
 *   any → idle           (on reset)
 */

import { useCallback, useRef, useState } from 'react';

import type { EntryPointCandidate, NLResolveResult } from '../../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NLResolveStatus = 'idle' | 'loading' | 'resolved' | 'disambiguation' | 'error';

export type NLResolveState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'resolved'; match: EntryPointCandidate; result: NLResolveResult }
  | { status: 'disambiguation'; matches: EntryPointCandidate[]; result: NLResolveResult }
  | { status: 'error'; message: string };

// Confidence threshold matching ADR Decision 4
const DIRECT_RESOLVE_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseNLResolveReturn {
  state: NLResolveState;
  /** Submit a query. No-op on empty string. Returns null if query was empty. */
  resolveQuery: (query: string) => Promise<NLResolveResult | null>;
  /** Reset to idle — call after a pick is made or the search is cancelled. */
  reset: () => void;
}

export function useNLResolve(): UseNLResolveReturn {
  const [state, setState] = useState<NLResolveState>({ status: 'idle' });
  // Track in-flight query to cancel superseded responses
  const activeQuery = useRef<string | null>(null);

  const resolveQuery = useCallback(async (query: string): Promise<NLResolveResult | null> => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return null;

    activeQuery.current = trimmed;
    setState({ status: 'loading' });

    try {
      const response = await window.electronAPI.flowTracer.resolveNaturalLanguage(trimmed);

      // Discard if a newer query has been submitted
      if (activeQuery.current !== trimmed) return null;

      if (!response.success) {
        setState({ status: 'error', message: response.error });
        return null;
      }

      const result = response.result;

      if (result.matches.length === 0) {
        setState({ status: 'error', message: 'No matching entry points found.' });
        return result;
      }

      if (result.confidence > DIRECT_RESOLVE_THRESHOLD) {
        setState({ status: 'resolved', match: result.matches[0], result });
      } else {
        setState({ status: 'disambiguation', matches: result.matches, result });
      }

      return result;
    } catch (err) {
      if (activeQuery.current !== trimmed) return null;
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: 'error', message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    activeQuery.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, resolveQuery, reset };
}
