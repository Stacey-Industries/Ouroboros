/**
 * ipc-handlers/app.ts â€” Shell, App, Theme, Titlebar IPC handlers
 */

import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent,Notification, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'

import { AppConfig,getConfigValue, setConfigValue } from '../config'
import { broadcastToWebClients } from '../web/webServer'
import { assertPathAllowed } from './pathSecurity'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow
type HandlerResult = { success: boolean; error?: string; skipped?: boolean }

interface AppNotificationOptions {
  title: string
  body: string
  icon?: string
  force?: boolean
}

function toErrorResult(err: unknown): HandlerResult {
  return { success: false, error: err instanceof Error ? err.message : String(err) }
}

function showItemInFolder(fullPath: string): HandlerResult {
  try {
    shell.showItemInFolder(fullPath)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function openExtensionsFolder(): Promise<HandlerResult> {
  try {
    const extensionsPath = path.join(app.getPath('userData'), 'extensions')
    await fs.mkdir(extensionsPath, { recursive: true })
    await shell.openPath(extensionsPath)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

async function openExternalUrl(url: string): Promise<HandlerResult> {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: 'Only http/https URLs are allowed' }
    }
    await shell.openExternal(url)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

function showNotification(options: AppNotificationOptions): HandlerResult {
  try {
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
    return toErrorResult(err)
  }
}

function broadcastThemeChange(theme: AppConfig['activeTheme']): void {
  for (const bw of BrowserWindow.getAllWindows()) {
    if (!bw.isDestroyed()) {
      bw.webContents.send('theme:changed', theme)
    }
  }
  broadcastToWebClients('theme:changed', theme)
}

function setTheme(theme: AppConfig['activeTheme']): HandlerResult {
  try {
    setConfigValue('activeTheme', theme)
    broadcastThemeChange(theme)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

function setTitlebarOverlayColors(
  event: IpcMainInvokeEvent,
  senderWindow: SenderWindow,
  color: string,
  symbolColor: string
): HandlerResult {
  try {
    if (process.platform === 'win32') {
      senderWindow(event).setTitleBarOverlay({ color, symbolColor, height: 32 })
    }
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}

function registerShellHandlers(channels: string[]): void {
  ipcMain.handle('shell:showItemInFolder', (event: IpcMainInvokeEvent, fullPath: string) => {
    const denied = assertPathAllowed(event, fullPath)
    if (denied) return denied
    return showItemInFolder(fullPath)
  })
  channels.push('shell:showItemInFolder')

  ipcMain.handle('shell:openExtensionsFolder', () => openExtensionsFolder())
  channels.push('shell:openExtensionsFolder')
}

function registerAppMetadataHandlers(channels: string[]): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  channels.push('app:getVersion')

  ipcMain.handle('app:getPlatform', () => process.platform)
  channels.push('app:getPlatform')
}

function registerAppInteractionHandlers(channels: string[]): void {
  ipcMain.handle('app:openExternal', (_event, url: string) => openExternalUrl(url))
  channels.push('app:openExternal')

  ipcMain.handle('app:notify', (_event, options: AppNotificationOptions) => showNotification(options))
  channels.push('app:notify')
}

function registerThemeHandlers(channels: string[]): void {
  ipcMain.handle('theme:get', () => getConfigValue('activeTheme'))
  channels.push('theme:get')

  ipcMain.handle('theme:set', (_event, theme: AppConfig['activeTheme']) => setTheme(theme))
  channels.push('theme:set')
}

function registerTitlebarHandlers(channels: string[], senderWindow: SenderWindow): void {
  ipcMain.handle(
    'titlebar:setOverlayColors',
    (event, color: string, symbolColor: string) =>
      setTitlebarOverlayColors(event, senderWindow, color, symbolColor)
  )
  channels.push('titlebar:setOverlayColors')
}

export function registerAppHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  registerShellHandlers(channels)
  registerAppMetadataHandlers(channels)
  registerAppInteractionHandlers(channels)
  registerThemeHandlers(channels)
  registerTitlebarHandlers(channels, senderWindow)
  return channels
}
