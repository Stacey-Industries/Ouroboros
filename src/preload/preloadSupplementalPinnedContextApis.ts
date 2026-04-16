import { ipcRenderer } from 'electron';

import type {
  ElectronAPI,
  PinnedContextChangedPayload,
} from '../renderer/types/electron';

type PinnedContextApiType = ElectronAPI['pinnedContext'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const pinnedContextApi: PinnedContextApiType = {
  add: (sessionId, item) =>
    ipcRenderer.invoke('pinnedContext:add', { sessionId, item }),
  remove: (sessionId, itemId) =>
    ipcRenderer.invoke('pinnedContext:remove', { sessionId, itemId }),
  dismiss: (sessionId, itemId) =>
    ipcRenderer.invoke('pinnedContext:dismiss', { sessionId, itemId }),
  list: (sessionId, includeDismissed) =>
    ipcRenderer.invoke('pinnedContext:list', { sessionId, includeDismissed }),
  onChanged: (callback: (payload: PinnedContextChangedPayload) => void) =>
    onChannel<PinnedContextChangedPayload>('pinnedContext:changed', callback),
};
