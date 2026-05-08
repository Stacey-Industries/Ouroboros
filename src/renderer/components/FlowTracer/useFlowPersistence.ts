/**
 * useFlowPersistence.ts — React hook for Flow Tracer persistence + Mermaid export.
 *
 * Exposes:
 *   saveCurrentFlow(flow, title)   — persists the given FlowTrace to disk
 *   refreshSavedFlows()            — re-fetches the saved-flows list
 *   loadFlow(id)                   — loads a saved FlowTrace by id
 *   exportMermaidToClipboard(flow) — converts to Mermaid and writes to system clipboard
 *
 * FlowTracerView integration (save/load buttons, saved-flows list) is left for
 * the orchestrator to apply post-merge. This hook and SavedFlowsPanel are ready.
 *
 * Wave 85 Phase 7.
 */

import { useCallback, useState } from 'react';

import type { FlowTrace, SavedFlowSummary } from '../../../shared/types/flowTracer';

export type PersistenceStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; id: string }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export interface UseFlowPersistenceResult {
  status: PersistenceStatus;
  savedFlows: SavedFlowSummary[];
  saveCurrentFlow: (flow: FlowTrace, title: string) => Promise<string | null>;
  refreshSavedFlows: () => Promise<void>;
  loadFlow: (id: string) => Promise<FlowTrace | null>;
  exportMermaidToClipboard: (flow: FlowTrace) => Promise<boolean>;
}

// ── Standalone async helpers (extracted to satisfy max-lines-per-function) ───

async function invokeSaveFlow(
  flow: FlowTrace,
  title: string,
  setStatus: (s: PersistenceStatus) => void,
): Promise<string | null> {
  setStatus({ kind: 'saving' });
  try {
    const response = await window.electronAPI.flowTracer.saveFlow(flow, title);
    if (!response.success) {
      setStatus({ kind: 'error', message: response.error });
      return null;
    }
    setStatus({ kind: 'saved', id: response.id });
    return response.id;
  } catch (err) {
    setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function invokeLoadFlow(
  id: string,
  setStatus: (s: PersistenceStatus) => void,
): Promise<FlowTrace | null> {
  setStatus({ kind: 'loading' });
  try {
    const response = await window.electronAPI.flowTracer.loadFlow(id);
    if (!response.success) {
      setStatus({ kind: 'error', message: response.error });
      return null;
    }
    setStatus({ kind: 'idle' });
    return response.flow;
  } catch (err) {
    setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFlowPersistence(): UseFlowPersistenceResult {
  const [status, setStatus] = useState<PersistenceStatus>({ kind: 'idle' });
  const [savedFlows, setSavedFlows] = useState<SavedFlowSummary[]>([]);

  const saveCurrentFlow = useCallback(
    (flow: FlowTrace, title: string) => invokeSaveFlow(flow, title, setStatus),
    [],
  );

  const refreshSavedFlows = useCallback(async (): Promise<void> => {
    try {
      const response = await window.electronAPI.flowTracer.listSavedFlows();
      if (response.success) setSavedFlows(response.flows);
    } catch {
      // Non-fatal — list stays stale
    }
  }, []);

  const loadFlow = useCallback((id: string) => invokeLoadFlow(id, setStatus), []);

  const exportMermaidToClipboard = useCallback(async (flow: FlowTrace): Promise<boolean> => {
    try {
      const response = await window.electronAPI.flowTracer.exportMermaid(flow);
      if (!response.success) return false;
      await navigator.clipboard.writeText(response.mermaid);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    status,
    savedFlows,
    saveCurrentFlow,
    refreshSavedFlows,
    loadFlow,
    exportMermaidToClipboard,
  };
}
