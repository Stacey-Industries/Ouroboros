/**
 * preloadSupplementalMarketplaceApis.ts — preload bridge for the marketplace.
 *
 * Wave 37 Phase D — signed marketplace IPC surface.
 *
 * Channels:
 *   marketplace:listBundles  — paired-read,  short
 *   marketplace:install      — paired-write, normal
 *   marketplace:revokedIds   — paired-read,  short
 */

import { ipcRenderer } from 'electron';

import type { MarketplaceAPI } from '../renderer/types/electron-marketplace';

export const marketplaceApi: MarketplaceAPI = {
  listBundles: () => ipcRenderer.invoke('marketplace:listBundles'),
  install: (args) => ipcRenderer.invoke('marketplace:install', args),
  revokedIds: () => ipcRenderer.invoke('marketplace:revokedIds'),
};
