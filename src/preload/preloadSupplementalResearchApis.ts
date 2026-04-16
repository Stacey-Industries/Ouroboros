/**
 * preloadSupplementalResearchApis.ts — contextBridge slice for the research
 * subagent IPC (Wave 25 Phase B).
 *
 * No business logic — just relays calls to main process.
 */

import { ipcRenderer } from 'electron';

import type { ElectronAPI } from '../renderer/types/electron';

type ResearchApiType = ElectronAPI['research'];

export const researchApi: ResearchApiType = {
  invoke: (input) => ipcRenderer.invoke('research:invoke', input),
};
