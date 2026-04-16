import { ipcRenderer } from 'electron';

import type { ElectronAPI, Profile } from '../renderer/types/electron';

type ProfileApiType = ElectronAPI['profileCrud'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const profileCrudApi: ProfileApiType = {
  list: () =>
    ipcRenderer.invoke('profileCrud:list'),
  upsert: (profile: Profile) =>
    ipcRenderer.invoke('profileCrud:upsert', { profile }),
  delete: (profileId: string) =>
    ipcRenderer.invoke('profileCrud:delete', { profileId }),
  setDefault: (projectRoot: string, profileId: string) =>
    ipcRenderer.invoke('profileCrud:setDefault', { projectRoot, profileId }),
  getDefault: (projectRoot: string) =>
    ipcRenderer.invoke('profileCrud:getDefault', { projectRoot }),
  export: (profileId: string) =>
    ipcRenderer.invoke('profileCrud:export', { profileId }),
  import: (json: string) =>
    ipcRenderer.invoke('profileCrud:import', { json }),
  onChanged: (callback: (profiles: Profile[]) => void) =>
    onChannel<Profile[]>('profileCrud:changed', callback),
};
