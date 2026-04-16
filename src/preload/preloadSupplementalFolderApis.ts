import { ipcRenderer } from 'electron';

import type { ElectronAPI, SessionFolder } from '../renderer/types/electron';

type FolderCrudApiType = ElectronAPI['folderCrud'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const folderCrudApi: FolderCrudApiType = {
  list: () => ipcRenderer.invoke('folderCrud:list'),
  create: (name: string) => ipcRenderer.invoke('folderCrud:create', { name }),
  rename: (id: string, name: string) => ipcRenderer.invoke('folderCrud:rename', { id, name }),
  delete: (id: string) => ipcRenderer.invoke('folderCrud:delete', { id }),
  addSession: (folderId: string, sessionId: string) =>
    ipcRenderer.invoke('folderCrud:addSession', { folderId, sessionId }),
  removeSession: (folderId: string, sessionId: string) =>
    ipcRenderer.invoke('folderCrud:removeSession', { folderId, sessionId }),
  moveSession: (fromId: string | null, toId: string | null, sessionId: string) =>
    ipcRenderer.invoke('folderCrud:moveSession', { fromId, toId, sessionId }),
  onChanged: (callback: (folders: SessionFolder[]) => void) =>
    onChannel<SessionFolder[]>('folderCrud:changed', callback),
};
