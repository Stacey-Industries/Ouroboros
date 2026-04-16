/**
 * preloadSupplementalLayoutApis.ts — Preload bridge for layout persistence (Wave 28 Phase D).
 */

import { ipcRenderer } from 'electron';

import type { ElectronAPI } from '../renderer/types/electron';

type LayoutApiType = ElectronAPI['layout'];

export const layoutApi: LayoutApiType = {
  getCustomLayout: (sessionId) =>
    ipcRenderer.invoke('layout:getCustomLayout', sessionId),
  setCustomLayout: (sessionId, tree) =>
    ipcRenderer.invoke('layout:setCustomLayout', sessionId, tree),
  deleteCustomLayout: (sessionId) =>
    ipcRenderer.invoke('layout:deleteCustomLayout', sessionId),
  promoteToGlobal: (name, tree) =>
    ipcRenderer.invoke('layout:promoteToGlobal', name, tree),
};
