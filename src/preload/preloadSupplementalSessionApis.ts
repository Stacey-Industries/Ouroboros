import { ipcRenderer } from 'electron';

import type { AgentMonitorSettings, ElectronAPI, SessionRecord } from '../renderer/types/electron';

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
  restore: (sessionId: string) => ipcRenderer.invoke('sessionCrud:restore', { sessionId }),
  delete: (sessionId: string) => ipcRenderer.invoke('sessionCrud:delete', { sessionId }),
  openChatWindow: (sessionId: string) =>
    ipcRenderer.invoke('sessionCrud:openChatWindow', { sessionId }),
  updateAgentMonitorSettings: (sessionId: string, settings: AgentMonitorSettings) =>
    ipcRenderer.invoke('sessionCrud:updateAgentMonitorSettings', { sessionId, settings }),
  pin: (sessionId: string, pinned: boolean) =>
    ipcRenderer.invoke('sessionCrud:pin', { sessionId, pinned }),
  softDelete: (sessionId: string) =>
    ipcRenderer.invoke('sessionCrud:softDelete', { sessionId }),
  restoreDeleted: (sessionId: string) =>
    ipcRenderer.invoke('sessionCrud:restoreDeleted', { sessionId }),
  setProfile: (sessionId: string, profileId: string) =>
    ipcRenderer.invoke('sessionCrud:setProfile', { sessionId, profileId }),
  setToolOverrides: (sessionId: string, toolOverrides: string[]) =>
    ipcRenderer.invoke('sessionCrud:setToolOverrides', { sessionId, toolOverrides }),
  setMcpOverrides: (sessionId: string, mcpServerOverrides: string[]) =>
    ipcRenderer.invoke('sessionCrud:setMcpOverrides', { sessionId, mcpServerOverrides }),
  onChanged: (callback: (sessions: SessionRecord[]) => void) =>
    onChannel<SessionRecord[]>('sessionCrud:changed', callback),
};
