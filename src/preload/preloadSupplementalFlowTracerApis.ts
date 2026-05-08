/**
 * preloadSupplementalFlowTracerApis.ts — Flow Tracer preload bridge.
 *
 * Wave 85 Phase 1 — walking skeleton. Relays the two Flow Tracer IPC channels
 * to the renderer and adds convenience wrappers (listFlows, runTrace).
 */

import { ipcRenderer } from 'electron';

import type { FlowTracerAPI } from '../renderer/types/electron-flow-tracer';
import type { FlowTrace } from '../shared/types/flowTracer';

export const flowTracerApi: FlowTracerAPI = {
  getCanonicalFlows: () => ipcRenderer.invoke('flowTracer:get-canonical-flows'),
  traceFlow: (entryPoint) => ipcRenderer.invoke('flowTracer:trace-flow', entryPoint),

  listFlows: async () => {
    const r = await ipcRenderer.invoke('flowTracer:get-canonical-flows');
    if (!r.success) throw new Error(r.error ?? 'flowTracer:get-canonical-flows failed');
    return r.flows;
  },

  runTrace: async (entryPoint) => {
    const r = await ipcRenderer.invoke('flowTracer:trace-flow', entryPoint);
    if (!r.success) throw new Error(r.error ?? 'flowTracer:trace-flow failed');
    return r.flow;
  },

  // ── Phase 3: per-symbol narration cache ───────────────────────────────────
  getNarration: (symbolRef) => ipcRenderer.invoke('flowTracer:get-narration', symbolRef),

  // ── Phase 7: persistence + Mermaid export ──────────────────────────────────

  saveFlow: (flow: FlowTrace, title: string) =>
    ipcRenderer.invoke('flowTracer:save-flow', flow, title),

  listSavedFlows: () => ipcRenderer.invoke('flowTracer:list-saved-flows'),

  loadFlow: (id: string) => ipcRenderer.invoke('flowTracer:load-flow', id),

  exportMermaid: (flow: FlowTrace) => ipcRenderer.invoke('flowTracer:export-mermaid', flow),
};
