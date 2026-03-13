/**
 * ipc-handlers/context.ts — Project context scanner and CLAUDE.md generator.
 *
 * IPC registration only. Scanner logic lives in contextScanner.ts,
 * generator in contextGenerator.ts, types in contextTypes.ts.
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { scanProject } from './contextScanner'
import { generateClaudeMdContent } from './contextGenerator'

export type { ProjectContext, ContextGenerateOptions } from './contextTypes'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerContextHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  ipcMain.handle('context:scan', async (_event, projectRoot: string) => {
    try {
      const context = await scanProject(projectRoot)
      return { success: true, context }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('context:scan')

  ipcMain.handle('context:generate', async (_event, projectRoot: string, options?: Parameters<typeof generateClaudeMdContent>[1]) => {
    try {
      const context = await scanProject(projectRoot)
      const content = generateClaudeMdContent(context, options ?? {})
      return { success: true, content, context }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('context:generate')

  return channels
}
