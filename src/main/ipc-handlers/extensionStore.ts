/**
 * ipc-handlers/extensionStore.ts - IPC handlers for the VSX Extension Store.
 */

import { BrowserWindow,ipcMain, IpcMainInvokeEvent } from 'electron';

import { getErrorMessage } from '../agentChat/utils';
import {
  getExtensionDetails,
  installExtension,
  searchExtensions,
} from './extensionStoreApi';
import {
  disableContributions,
  enableContributions,
  getIconThemeContributions,
  getProductIconThemeContributions,
  getThemeContributions,
  refreshInstalledListFromDisk,
  uninstallExtension,
} from './extensionStoreHelpers';
import { registerMarketplaceHandlers } from './extensionStoreMarketplace';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type HandlerSuccess<T extends object = Record<string, never>> = { success: true } & T;
type HandlerFailure = { success: false; error: string };

// Re-export types and state accessors consumed by other modules
export type {
  InstalledVsxExtension,
  InstallFromBufferOptions,
  VsxExtensionDetail,
} from './extensionStoreHelpers';
export {
  broadcastToWindows,
  EXTENSIONS_DIR,
  getDisabledList,
  getInstalledList,
  installExtensionFromBuffer,
  setDisabledList,
  setInstalledList,
} from './extensionStoreHelpers';

async function runHandler<T extends object>(
  action: () => Promise<T>,
): Promise<HandlerSuccess<T> | HandlerFailure> {
  try {
    return { success: true, ...(await action()) };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

function registerHandler(channels: string[], channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

async function getInstalledExtensions() {
  return { extensions: await refreshInstalledListFromDisk() };
}

function registerCrudHandlers(channels: string[]): void {
  registerHandler(channels, 'extensionStore:search', async (_event, query: string, offset?: number) => runHandler(() => searchExtensions(query, offset ?? 0)));
  registerHandler(channels, 'extensionStore:getDetails', async (_event, namespace: string, name: string) => runHandler(() => getExtensionDetails(namespace, name)));
  registerHandler(channels, 'extensionStore:install', async (_event, namespace: string, name: string, version?: string) => runHandler(() => installExtension(namespace, name, version)));
  registerHandler(channels, 'extensionStore:uninstall', async (_event, id: string) => runHandler(() => uninstallExtension(id)));
  registerHandler(channels, 'extensionStore:getInstalled', async () => runHandler(() => getInstalledExtensions()));
}

function registerContributionHandlers(channels: string[]): void {
  registerHandler(channels, 'extensionStore:enableContributions', async (_event, id: string) => runHandler(() => enableContributions(id)));
  registerHandler(channels, 'extensionStore:disableContributions', async (_event, id: string) => runHandler(() => disableContributions(id)));
  registerHandler(channels, 'extensionStore:getThemeContributions', async () => runHandler(() => getThemeContributions()));
  registerHandler(channels, 'extensionStore:getIconThemeContributions', async () => runHandler(() => getIconThemeContributions()));
  registerHandler(channels, 'extensionStore:getProductIconThemeContributions', async () => runHandler(() => getProductIconThemeContributions()));
}

export function registerExtensionStoreHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const channels: string[] = [];
  registerCrudHandlers(channels);
  registerContributionHandlers(channels);
  registerMarketplaceHandlers(channels, registerHandler);
  return channels;
}
