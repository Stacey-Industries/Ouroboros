/**
 * preloadSupplementalSubagentApis.ts — Preload bridge for subagent tracking (Wave 27 Phase A).
 */

import { ipcRenderer } from 'electron';

import type { ElectronAPI, SubagentUpdatedEvent } from '../renderer/types/electron';

type SubagentApiType = ElectronAPI['subagent'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const subagentApi: SubagentApiType = {
  list: (args) =>
    ipcRenderer.invoke('subagent:list', args),
  get: (args) =>
    ipcRenderer.invoke('subagent:get', args),
  liveCount: (args) =>
    ipcRenderer.invoke('subagent:liveCount', args),
  costRollup: (args) =>
    ipcRenderer.invoke('subagent:costRollup', args),
  cancel: (args) =>
    ipcRenderer.invoke('subagent:cancel', args),
  onUpdated: (callback: (event: SubagentUpdatedEvent) => void) =>
    onChannel<SubagentUpdatedEvent>('subagent:updated', callback),
};
