/**
 * preloadSupplementalFlowTracerApis.ts — Flow Tracer preload bridge.
 *
 * Wave 85 Phase 1 — walking skeleton. Relays the two Flow Tracer IPC channels
 * to the renderer and adds convenience wrappers (listFlows, runTrace).
 */

import { ipcRenderer } from 'electron';

import type { FlowTracerAPI } from '../renderer/types/electron-flow-tracer';

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
};
