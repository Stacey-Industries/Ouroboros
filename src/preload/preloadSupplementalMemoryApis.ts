import { ipcRenderer } from 'electron';

import type { ElectronAPI } from '../renderer/types/electron';

type MemoryApi = ElectronAPI['memory'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const memoryApi: MemoryApi = {
  list: (projectRoot?: string) => ipcRenderer.invoke('memory:list', { projectRoot }),
  read: (args: { projectRoot?: string; id: string }) => ipcRenderer.invoke('memory:read', args),
  onChanged: (callback: () => void) => onChannel<void>('memory:changed', callback),
};
