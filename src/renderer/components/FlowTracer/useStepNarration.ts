/**
 * useStepNarration.ts — Hook for fetching per-symbol What+How narration.
 *
 * Wave 85 Phase 3. Called by the FlowTracer side panel on step hover.
 * Debounced 150ms to avoid flooding IPC on rapid hover transitions.
 *
 * Integration note: FlowTracerView.tsx is contended with Phase 7 in this
 * parallel dispatch. The hook is complete and ready; the orchestrator wires
 * it into FlowTracerView's side-panel hover handler post-merge.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Narration, SymbolRef } from '../../../shared/types/flowTracer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NarrationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; narration: Narration | { stale: true } }
  | { status: 'miss' } // cache miss — background generation queued
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 150;

function symbolKey(ref: SymbolRef): string {
  return `${ref.file}:${ref.line}:${ref.symbol}`;
}

function applyResponse(
  response: Awaited<ReturnType<typeof window.electronAPI.flowTracer.getNarration>>,
  setState: (s: NarrationState) => void,
): void {
  if (!response.success) {
    setState({ status: 'error', message: response.error });
    return;
  }
  if (response.narration === null) {
    setState({ status: 'miss' });
  } else {
    setState({ status: 'ready', narration: response.narration });
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStepNarration(symbolRef: SymbolRef | null): NarrationState {
  const [state, setState] = useState<NarrationState>({ status: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKey = useRef<string | null>(null);

  const fetchNarration = useCallback(async (ref: SymbolRef) => {
    const key = symbolKey(ref);
    activeKey.current = key;
    setState({ status: 'loading' });
    try {
      const response = await window.electronAPI.flowTracer.getNarration(ref);
      if (activeKey.current !== key) return; // superseded by newer hover
      applyResponse(response, setState);
    } catch (err) {
      if (activeKey.current !== key) return;
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (!symbolRef) {
      activeKey.current = null;
      setState({ status: 'idle' });
      return;
    }
    timerRef.current = setTimeout(() => {
      fetchNarration(symbolRef).catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [symbolRef, fetchNarration]);

  return state;
}
