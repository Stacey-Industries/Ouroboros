/**
 * ipc-handlers/pty.ts â€” PTY IPC handlers
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import {
  spawnPty,
  spawnClaudePty,
  writeToPty,
  resizePty,
  killPty,
  getPtyCwd,
  startPtyRecording,
  stopPtyRecording,
  getActiveSessions,
} from '../pty'
import { getConfigValue } from '../config'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

interface PtySpawnOptions {
  cwd?: string
  cols?: number
  rows?: number
  startupCommand?: string
}

interface ClaudeSpawnOptions extends PtySpawnOptions {
  initialPrompt?: string
  cliOverrides?: Record<string, unknown>
  resumeMode?: string
}

function getClaudeCliSettings(options?: ClaudeSpawnOptions) {
  const baseSettings = getConfigValue('claudeCliSettings')
  return options?.cliOverrides
    ? { ...baseSettings, ...options.cliOverrides } as typeof baseSettings
    : baseSettings
}

function registerSpawnHandlers(channels: string[], senderWindow: SenderWindow): void {
  ipcMain.handle('pty:spawn', (event, id: string, options: PtySpawnOptions) =>
    spawnPty(id, senderWindow(event), options)
  )
  channels.push('pty:spawn')

  ipcMain.handle('pty:spawnClaude', (event, id: string, options: ClaudeSpawnOptions) =>
    spawnClaudePty(id, senderWindow(event), getClaudeCliSettings(options), options)
  )
  channels.push('pty:spawnClaude')
}

function registerSessionHandlers(channels: string[]): void {
  ipcMain.handle('pty:write', (_event, id: string, data: string) => writeToPty(id, data))
  channels.push('pty:write')

  ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) =>
    resizePty(id, cols, rows)
  )
  channels.push('pty:resize')

  ipcMain.handle('pty:kill', (_event, id: string) => killPty(id))
  channels.push('pty:kill')

  ipcMain.handle('pty:getCwd', (_event, id: string) => getPtyCwd(id))
  channels.push('pty:getCwd')

  ipcMain.handle('pty:listSessions', () => getActiveSessions())
  channels.push('pty:listSessions')
}

function registerRecordingHandlers(channels: string[], senderWindow: SenderWindow): void {
  ipcMain.handle('pty:startRecording', (event, id: string) =>
    startPtyRecording(id, senderWindow(event))
  )
  channels.push('pty:startRecording')

  ipcMain.handle('pty:stopRecording', (event, id: string) =>
    stopPtyRecording(id, senderWindow(event))
  )
  channels.push('pty:stopRecording')
}

export function registerPtyHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  registerSpawnHandlers(channels, senderWindow)
  registerSessionHandlers(channels)
  registerRecordingHandlers(channels, senderWindow)
  return channels
}
