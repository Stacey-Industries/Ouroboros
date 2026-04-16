/**
 * preloadSupplementalWorkspaceReadListApis.ts — Preload bridge for workspace read-list (Wave 25 Phase E).
 */

import { ipcRenderer } from 'electron';

import type {
  ElectronAPI,
  WorkspaceReadListChangedPayload,
} from '../renderer/types/electron';

type WorkspaceReadListApiType = ElectronAPI['workspaceReadList'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const workspaceReadListApi: WorkspaceReadListApiType = {
  get: (projectRoot) =>
    ipcRenderer.invoke('workspaceReadList:get', { projectRoot }),
  add: (projectRoot, filePath) =>
    ipcRenderer.invoke('workspaceReadList:add', { projectRoot, filePath }),
  remove: (projectRoot, filePath) =>
    ipcRenderer.invoke('workspaceReadList:remove', { projectRoot, filePath }),
  onChanged: (callback: (payload: WorkspaceReadListChangedPayload) => void) =>
    onChannel<WorkspaceReadListChangedPayload>('workspaceReadList:changed', callback),
};
