/**
 * preloadSupplementalGraphApis.ts — Graph IPC bridge.
 *
 * Exposes existing graph:* channels to the renderer.
 * No new channels are added here — only wiring to main-process handlers
 * registered in src/main/ipc-handlers/graphHandlers.ts.
 */

import { ipcRenderer } from 'electron';

import type { GraphAPI } from '../renderer/types/electron-graph';

export const graphApi: GraphAPI = {
  searchGraph: (query, limit) => ipcRenderer.invoke('graph:searchGraph', query, limit),
  getArchitecture: (aspects) => ipcRenderer.invoke('graph:getArchitecture', aspects),
  getStatus: () => ipcRenderer.invoke('graph:getStatus'),
};
