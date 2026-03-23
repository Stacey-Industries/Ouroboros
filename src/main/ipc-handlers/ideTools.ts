/**
 * ipc-handlers/ideTools.ts — IPC handlers for the IDE tool server reverse channel.
 *
 * Handles:
 *   ideTools:respond  — renderer sends back a query response
 *   ideTools:getAddress — renderer asks for the tool server address
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import { getIdeToolServerAddress, handleRendererQueryResponse } from '../ideToolServer';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerIdeToolsHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = [];

  // Renderer responds to a query from the tool server
  ipcMain.handle('ideTools:respond', (_event, queryId: string, result: unknown, error?: string) => {
    handleRendererQueryResponse(queryId, result, error);
    return { success: true };
  });
  channels.push('ideTools:respond');

  // Renderer asks for the tool server address
  ipcMain.handle('ideTools:getAddress', () => {
    return { address: getIdeToolServerAddress() };
  });
  channels.push('ideTools:getAddress');

  return channels;
}
