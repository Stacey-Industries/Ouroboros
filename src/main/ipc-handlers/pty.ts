/**
 * ipc-handlers/pty.ts — PTY IPC handlers
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { spawnPty, spawnClaudePty, writeToPty, resizePty, killPty, getPtyCwd, startPtyRecording, stopPtyRecording, getActiveSessions } from '../pty'
import { getConfigValue } from '../config'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

export function registerPtyHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  ipcMain.handle(
    'pty:spawn',
    (event, id: string, options: { cwd?: string; cols?: number; rows?: number; startupCommand?: string }) => {
      return spawnPty(id, senderWindow(event), options)
    }
  )
  channels.push('pty:spawn')

  ipcMain.handle(
    'pty:spawnClaude',
    (event, id: string, options: { cwd?: string; cols?: number; rows?: number; initialPrompt?: string; cliOverrides?: Record<string, unknown>; resumeMode?: string }) => {
      const win = senderWindow(event)
      const baseSettings = getConfigValue('claudeCliSettings')
      const settings = options?.cliOverrides
        ? { ...baseSettings, ...options.cliOverrides } as typeof baseSettings
        : baseSettings
      return spawnClaudePty(id, win, settings, options)
    }
  )
  channels.push('pty:spawnClaude')

  ipcMain.handle('pty:write', (_event, id: string, data: string) => {
    return writeToPty(id, data)
  })
  channels.push('pty:write')

  ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) => {
    return resizePty(id, cols, rows)
  })
  channels.push('pty:resize')

  ipcMain.handle('pty:kill', (_event, id: string) => {
    return killPty(id)
  })
  channels.push('pty:kill')

  ipcMain.handle('pty:getCwd', (_event, id: string) => {
    return getPtyCwd(id)
  })
  channels.push('pty:getCwd')

  ipcMain.handle('pty:startRecording', (event, id: string) => {
    return startPtyRecording(id, senderWindow(event))
  })
  channels.push('pty:startRecording')

  ipcMain.handle('pty:stopRecording', (event, id: string) => {
    return stopPtyRecording(id, senderWindow(event))
  })
  channels.push('pty:stopRecording')

  ipcMain.handle('pty:listSessions', () => {
    return getActiveSessions()
  })
  channels.push('pty:listSessions')

  return channels
}
