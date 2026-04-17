/**
 * preloadSupplementalResearchApis.ts — contextBridge slice for the research
 * subagent IPC (Wave 25 Phase B), research mode controls (Wave 30 Phase G),
 * and the research metrics dashboard (Wave 30 Phase H).
 *
 * No business logic — just relays calls to main process.
 */

import { ipcRenderer } from 'electron';

import type { ElectronAPI } from '../renderer/types/electron';

type ResearchApiType = ElectronAPI['research'];

export const researchApi: ResearchApiType = {
  invoke: (input) => ipcRenderer.invoke('research:invoke', input),

  // ── Wave 30 Phase G — per-session mode + global default controls ──────────
  getSessionMode: (sessionId) =>
    ipcRenderer.invoke('research:getSessionMode', { sessionId }),
  setSessionMode: (sessionId, mode) =>
    ipcRenderer.invoke('research:setSessionMode', { sessionId, mode }),
  getGlobalDefault: () =>
    ipcRenderer.invoke('research:getGlobalDefault', {}),
  setGlobalDefault: (globalEnabled, defaultMode) =>
    ipcRenderer.invoke('research:setGlobalDefault', { globalEnabled, defaultMode }),

  // ── Wave 30 Phase H — research metrics dashboard ──────────────────────────
  getDashboardMetrics: (range) =>
    ipcRenderer.invoke('research:getDashboardMetrics', range),
};
