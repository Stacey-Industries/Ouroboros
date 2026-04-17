/**
 * preloadSupplementalGraphApis.ts — Graph IPC bridge.
 *
 * Exposes graph:* channels to the renderer.
 * Wired to main-process handlers in src/main/ipc-handlers/graphHandlers.ts
 * and src/main/ipc-handlers/graphHandlersNeighbourhood.ts.
 */

import { ipcRenderer } from 'electron';

import type { GraphAPI } from '../renderer/types/electron-graph';

export const graphApi: GraphAPI = {
  searchGraph: (query, limit) => ipcRenderer.invoke('graph:searchGraph', query, limit),
  getArchitecture: (aspects) => ipcRenderer.invoke('graph:getArchitecture', aspects),
  getStatus: () => ipcRenderer.invoke('graph:getStatus'),
  getNeighbourhood: (symbolId, depth) =>
    ipcRenderer.invoke('graph:getNeighbourhood', symbolId, depth),
  getBlastRadius: (symbolId, depth) =>
    ipcRenderer.invoke('graph:getBlastRadius', symbolId, depth),
};
