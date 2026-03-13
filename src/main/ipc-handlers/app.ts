/**
 * ipc-handlers/app.ts — Shell, App, Theme, Titlebar IPC handlers
 */

import { ipcMain, shell, app, BrowserWindow, Notification, IpcMainInvokeEvent } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { getConfigValue, setConfigValue, AppConfig } from '../config'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

export function registerAppHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  // ─── Shell ────────────────────────────────────────────────────────────────

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    try {
      shell.showItemInFolder(fullPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('shell:showItemInFolder')

  ipcMain.handle('shell:openExtensionsFolder', async () => {
    try {
      const extensionsPath = path.join(app.getPath('userData'), 'extensions')
      await fs.mkdir(extensionsPath, { recursive: true })
      await shell.openPath(extensionsPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('shell:openExtensionsFolder')

  // ─── App ──────────────────────────────────────────────────────────────────

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })
  channels.push('app:getVersion')

  ipcMain.handle('app:getPlatform', () => {
    return process.platform
  })
  channels.push('app:getPlatform')

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    try {
      // Security: only allow http/https
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http/https URLs are allowed' }
      }
      await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('app:openExternal')

  ipcMain.handle('app:notify', (_event, options: { title: string; body: string; icon?: string; force?: boolean }) => {
    try {
      // Only notify when the app window is not focused (unless force is set)
      if (!options.force && BrowserWindow.getFocusedWindow() !== null) {
        return { success: true, skipped: true }
      }
      if (!Notification.isSupported()) {
        return { success: false, error: 'Notifications not supported on this platform' }
      }
      const notif = new Notification({
        title: options.title,
        body: options.body,
        ...(options.icon ? { icon: options.icon } : {}),
      })
      notif.show()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('app:notify')

  // ─── Theme ────────────────────────────────────────────────────────────────

  ipcMain.handle('theme:get', () => {
    return getConfigValue('activeTheme')
  })
  channels.push('theme:get')

  ipcMain.handle('theme:set', (_event, theme: AppConfig['activeTheme']) => {
    try {
      setConfigValue('activeTheme', theme)
      // Broadcast to all windows
      for (const bw of BrowserWindow.getAllWindows()) {
        if (!bw.isDestroyed()) {
          bw.webContents.send('theme:changed', theme)
        }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('theme:set')

  // ─── Titlebar ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'titlebar:setOverlayColors',
    (event, color: string, symbolColor: string) => {
      try {
        if (process.platform === 'win32') {
          senderWindow(event).setTitleBarOverlay({ color, symbolColor, height: 32 })
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
  channels.push('titlebar:setOverlayColors')

  return channels
}
