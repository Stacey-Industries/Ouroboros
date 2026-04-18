/**
 * useCompareSession.ts — Wave 36 Phase F
 *
 * Manages the compare-providers session lifecycle:
 * - spawns two sessions via compareProviders:start IPC
 * - fans incoming compareProviders:event payloads to per-provider state
 * - exposes cancel()
 *
 * Gated: only usable when providers.multiProvider === true (callers must check).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompareProvidersEventPayload } from '../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompareSessionStatus = 'idle' | 'starting' | 'running' | 'completed' | 'error' | 'cancelled';

export interface ProviderPaneState {
  providerId: string;
  text: string;
  status: 'streaming' | 'completed' | 'error' | 'idle';
  cost: number | null;
  completedAt: number | null;
}

export interface CompareSessionState {
  compareId: string | null;
  status: CompareSessionStatus;
  paneA: ProviderPaneState;
  paneB: ProviderPaneState;
  error: string | null;
}

export interface UseCompareSessionReturn {
  state: CompareSessionState;
  start: (opts: StartOpts) => Promise<void>;
  cancel: () => Promise<void>;
}

interface StartOpts {
  prompt: string;
  projectPath: string;
  providerIds: [string, string];
}

// ─── Initial state helpers ────────────────────────────────────────────────────

function makeIdlePane(providerId: string): ProviderPaneState {
  return { providerId, text: '', status: 'idle', cost: null, completedAt: null };
}

function makeInitialState(providerIds: [string, string]): CompareSessionState {
  return {
    compareId: null, status: 'starting',
    paneA: makeIdlePane(providerIds[0]),
    paneB: makeIdlePane(providerIds[1]),
    error: null,
  };
}

// ─── Event application ────────────────────────────────────────────────────────

function applyEvent(pane: ProviderPaneState, event: CompareProvidersEventPayload['event']): ProviderPaneState {
  switch (event.type) {
    case 'stdout': {
      const chunk = typeof event.payload === 'string' ? event.payload : '';
      return { ...pane, text: pane.text + chunk, status: 'streaming' };
    }
    case 'completion':
      return { ...pane, status: 'completed', completedAt: event.at };
    case 'error':
      return { ...pane, status: 'error' };
    case 'cost-update': {
      const cost = typeof event.payload === 'number' ? event.payload : pane.cost;
      return { ...pane, cost };
    }
    default:
      return pane;
  }
}

// ─── Hook helpers ─────────────────────────────────────────────────────────────

const EMPTY_STATE: CompareSessionState = {
  compareId: null, status: 'idle',
  paneA: makeIdlePane(''), paneB: makeIdlePane(''),
  error: null,
};

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

type SetState = React.Dispatch<React.SetStateAction<CompareSessionState>>;

function buildEventHandler(compareId: string, setState: SetState) {
  return (payload: CompareProvidersEventPayload) => {
    if (payload.compareId !== compareId) return;
    setState((s) => {
      const isA = payload.providerId === s.paneA.providerId;
      const paneA = isA ? applyEvent(s.paneA, payload.event) : s.paneA;
      const paneB = !isA ? applyEvent(s.paneB, payload.event) : s.paneB;
      const bothDone = paneA.status !== 'streaming' && paneA.status !== 'idle'
        && paneB.status !== 'streaming' && paneB.status !== 'idle';
      return { ...s, paneA, paneB, status: bothDone ? 'completed' : 'running' };
    });
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompareSession(): UseCompareSessionReturn {
  const [state, setState] = useState<CompareSessionState>(EMPTY_STATE);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const start = useCallback(async (opts: StartOpts) => {
    if (!hasElectronAPI()) return;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setState(makeInitialState(opts.providerIds));
    const result = await window.electronAPI.compareProviders.start(opts);
    if (!result.success || !result.compareId) {
      setState((s) => ({ ...s, status: 'error', error: result.error ?? 'Start failed' }));
      return;
    }
    const { compareId } = result;
    setState((s) => ({ ...s, compareId, status: 'running' }));
    cleanupRef.current = window.electronAPI.compareProviders.onEvent(
      buildEventHandler(compareId, setState),
    );
  }, []);

  const cancel = useCallback(async () => {
    if (!hasElectronAPI()) return;
    const { compareId } = state;
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (compareId) await window.electronAPI.compareProviders.cancel(compareId);
    setState((s) => ({ ...s, status: 'cancelled' }));
  }, [state]);

  return { state, start, cancel };
}
