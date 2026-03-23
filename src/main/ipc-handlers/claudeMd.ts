/**
 * ipc-handlers/claudeMd.ts — CLAUDE.md generation IPC handlers
 */

import { type BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';

// These imports come from the generator service (created by another agent)
import { generateClaudeMd, generateForDirectory, getGenerationStatus } from '../claudeMdGenerator';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

export function registerClaudeMdHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const channels: string[] = [];

  ipcMain.handle(
    'claudeMd:generate',
    async (_event, projectRoot: string, options?: { fullSweep?: boolean }) => {
      try {
        const results = await generateClaudeMd(projectRoot, options);
        return { success: true, results };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  channels.push('claudeMd:generate');

  ipcMain.handle(
    'claudeMd:generateForDir',
    async (_event, projectRoot: string, dirPath: string) => {
      try {
        const result = await generateForDirectory(projectRoot, dirPath);
        return { success: true, result };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  channels.push('claudeMd:generateForDir');

  ipcMain.handle('claudeMd:getStatus', async () => {
    try {
      const status = getGenerationStatus();
      return { success: true, status };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  channels.push('claudeMd:getStatus');

  return channels;
}
