import { ipcRenderer } from 'electron';

import type { ElectronAPI, SessionRecord } from '../renderer/types/electron';

type SessionCrudApiType = ElectronAPI['sessionCrud'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const sessionCrudApi: SessionCrudApiType = {
  list: () => ipcRenderer.invoke('sessionCrud:list'),
  active: () => ipcRenderer.invoke('sessionCrud:active'),
  create: (projectRoot: string) => ipcRenderer.invoke('sessionCrud:create', { projectRoot }),
  activate: (sessionId: string) => ipcRenderer.invoke('sessionCrud:activate', { sessionId }),
  archive: (sessionId: string) => ipcRenderer.invoke('sessionCrud:archive', { sessionId }),
  delete: (sessionId: string) => ipcRenderer.invoke('sessionCrud:delete', { sessionId }),
  openChatWindow: (sessionId: string) =>
    ipcRenderer.invoke('sessionCrud:openChatWindow', { sessionId }),
  onChanged: (callback: (sessions: SessionRecord[]) => void) =>
    onChannel<SessionRecord[]>('sessionCrud:changed', callback),
};
