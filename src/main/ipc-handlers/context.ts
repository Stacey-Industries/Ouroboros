/**
 * ipc-handlers/context.ts — Project context scanner and CLAUDE.md generator.
 *
 * IPC registration only. Scanner logic lives in contextScanner.ts,
 * generator in contextGenerator.ts, types in contextTypes.ts.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import { generateClaudeMdContent } from './contextGenerator';
import { scanProject } from './contextScanner';
import { assertPathAllowed } from './pathSecurity';

export type { ContextGenerateOptions, ProjectContext } from './contextTypes';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

export function registerContextHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const channels: string[] = [];

  ipcMain.handle('context:scan', async (event, projectRoot: string) => {
    const denied = assertPathAllowed(event, projectRoot);
    if (denied) return denied;
    try {
      const context = await scanProject(projectRoot);
      return { success: true, context };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  channels.push('context:scan');

  ipcMain.handle(
    'context:generate',
    async (event, projectRoot: string, options?: Parameters<typeof generateClaudeMdContent>[1]) => {
      const denied = assertPathAllowed(event, projectRoot);
      if (denied) return denied;
      try {
        const context = await scanProject(projectRoot);
        const content = generateClaudeMdContent(context, options ?? {});
        return { success: true, content, context };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
  channels.push('context:generate');

  return channels;
}
