/**
 * ipc-handlers/app.ts â€” Shell, App, Theme, Titlebar IPC handlers
 */

import { exec, spawn } from 'child_process'

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

function runBuildCommand(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = 'npm run build && npm run build:web'
    exec(cmd, { cwd, timeout: 300000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
      } else {
        resolve(stdout)
      }
    })
  })
}

function registerRebuildHandlers(channels: string[]): void {
  ipcMain.handle('app:rebuildAndRestart', async () => {
    try {
      // In dev mode: app.getAppPath() == project root (has package.json)
      // In packaged app: app.getAppPath('exe') == dir containing the .exe (has package.json)
      // app.getAppPath() in a packaged app returns resources/app.asar (no package.json)
      const projectRoot = app.isPackaged
        ? path.dirname(app.getAppPath('exe'))
        : app.getAppPath()
      broadcastToWebClients('app:rebuilding', { status: 'building' })
      await runBuildCommand(projectRoot)
      broadcastToWebClients('app:rebuilding', { status: 'restarting' })

      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 500)

      return { success: true }
    } catch (err) {
      return toErrorResult(err)
    }
  })

  // Web rebuild: rebuilds the web UI and restarts the dev server WITHOUT killing
  // the Electron process. The web client listens for the 'done' status and reloads.
  ipcMain.handle('app:rebuildWeb', async () => {
    return new Promise((resolve) => {
      const projectRoot = app.isPackaged
        ? path.dirname(app.getAppPath('exe'))
        : app.getAppPath()

      broadcastToWebClients('app:rebuilding', { status: 'building' })

      // Rebuild the web assets
      exec('npm run build:web', { cwd: projectRoot, timeout: 300000 }, (err, stdout, stderr) => {
        if (err) {
          broadcastToWebClients('app:rebuilding', { status: 'error', message: stderr || err.message })
          resolve(toErrorResult(new Error(stderr || err.message)))
          return
        }

        // Restart the dev server as a detached background process
        // so the Electron app (and its web server) keep running.
        // shell: true routes through cmd.exe on Windows, resolving npm from PATH.
        // stdio: 'ignore' + unref() fully detaches the child from this process.
        broadcastToWebClients('app:rebuilding', { status: 'restarting' })

        const child = spawn('npm', ['run', 'dev'], {
          cwd: projectRoot,
          detached: true,
          stdio: 'ignore',
          shell: true,
        })
        child.unref()

        broadcastToWebClients('app:rebuilding', { status: 'done' })
        resolve({ success: true })
      })
    })
  })

  channels.push('app:rebuildAndRestart')
  channels.push('app:rebuildWeb')
}

export function registerAppHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = []
  registerShellHandlers(channels)
  registerAppMetadataHandlers(channels)
  registerAppInteractionHandlers(channels)
  registerThemeHandlers(channels)
  registerTitlebarHandlers(channels, senderWindow)
  registerRebuildHandlers(channels)
  return channels
}
