/**
 * useFlowWhy.ts — Hook for fetching per-flow chain-aware Why narration.
 *
 * Wave 85 Phase 4. Called by the FlowTracer view when a new flow is rendered.
 * Returns a stepId-keyed map of Why strings so any component can look up
 * the Why for a given step in O(1).
 *
 * Pattern mirrors useStepNarration.ts (Phase 3): cancels superseded requests
 * when the flow id changes, surfaces loading + error state.
 *
 * Integration note: FlowTracerView.tsx integration is the orchestrator's
 * post-merge task. This hook is complete and tested standalone.
 */

import { useEffect, useRef, useState } from 'react';

import type { FlowTrace } from '../../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FlowWhyState = {
  entries: Map<string, string>; // stepId → why text
  loading: boolean;
  error: string | null;
};

const IDLE_STATE: FlowWhyState = { entries: new Map(), loading: false, error: null };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch chain-aware Why entries for the given flow.
 *
 * - On flow change (keyed by flow.id): fires IPC `getFlowWhy`, replaces state.
 * - Cancels the previous in-flight request when flow id changes.
 * - Returns idle state when flow is null.
 */
export function useFlowWhy(flow: FlowTrace | null): FlowWhyState {
  const [state, setState] = useState<FlowWhyState>(IDLE_STATE);
  const activeFlowId = useRef<string | null>(null);

  useEffect(() => {
    if (!flow) {
      activeFlowId.current = null;
      setState(IDLE_STATE);
      return;
    }

    const flowId = flow.id;
    activeFlowId.current = flowId;
    setState({ entries: new Map(), loading: true, error: null });

    window.electronAPI.flowTracer
      .getFlowWhy(flow)
      .then((response) => {
        if (activeFlowId.current !== flowId) return; // superseded by newer flow

        if (!response.success) {
          setState({ entries: new Map(), loading: false, error: response.error });
          return;
        }

        const map = new Map<string, string>();
        for (const entry of response.entries) {
          map.set(entry.stepId, entry.why);
        }
        setState({ entries: map, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (activeFlowId.current !== flowId) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ entries: new Map(), loading: false, error: message });
      });
    // flow.id is the stable identity key; the full flow object is captured
    // via the closure above and passed to getFlowWhy directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.id]);

  return state;
}
