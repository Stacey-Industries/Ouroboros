import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { cleanupIpcHandlers } from './ipc'
import { killAllPtySessions } from './pty'
import { startHooksServer, stopHooksServer } from './hooks'
import { startIdeToolServer, stopIdeToolServer } from './ideToolServer'
import { installHooks } from './hookInstaller'
import { initExtensions } from './extensions'
import { buildApplicationMenu } from './menu'
import { createWindow, getAllActiveWindows } from './windowManager'

// â”€â”€â”€ Auto-updater (electron-updater â€” optional dep) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater: any = null
try {
  // electron-updater is an optional dependency; gracefully skip if absent
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updaterModule = require('electron-updater')
  autoUpdater = updaterModule.autoUpdater
} catch {
  console.log('[updater] electron-updater not installed â€” auto-update disabled')
}

// â”€â”€â”€ Crash logging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getCrashLogDir(): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'crashes')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function writeCrashLog(source: string, details: string): Promise<void> {
  try {
    const dir = await getCrashLogDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(dir, `crash-${timestamp}.log`)
    const content = [
      `Source: ${source}`,
      `Timestamp: ${new Date().toISOString()}`,
      `App version: ${app.getVersion()}`,
      `Platform: ${process.platform} ${process.arch}`,
      '',
      details,
    ].join('\n')
    await fs.writeFile(file, content, 'utf-8')
    console.error(`[crash] Logged to ${file}`)
  } catch (err) {
    console.error('[crash] Failed to write crash log:', err)
  }
}

// Capture uncaught main-process exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('[main] uncaughtException:', err)
  void writeCrashLog('main:uncaughtException', `${err.stack ?? err.message}`)
})

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
  console.error('[main] unhandledRejection:', msg)
  void writeCrashLog('main:unhandledRejection', msg)
})

// Suppress GPU errors in dev
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('no-sandbox') // Remove in production signing

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null

// â”€â”€â”€ Performance metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let perfInterval: ReturnType<typeof setInterval> | null = null

function broadcastToActiveWindows(channel: string, payload: unknown): void {
  for (const win of getAllActiveWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

/** Broadcasts perf metrics to all open windows. */
function startPerfMetrics(): void {
  if (perfInterval !== null) return
  perfInterval = setInterval(() => {
    try {
      const mem = process.memoryUsage()
      const appMetrics = app.getAppMetrics()
      broadcastToActiveWindows('perf:metrics', {
        timestamp: Date.now(),
        memory: {
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          rss: mem.rss,
          external: mem.external,
        },
        processes: appMetrics.map((m) => ({
          pid: m.pid,
          type: m.type,
          cpu: m.cpu,
          memory: m.memory,
        })),
      })
    } catch {
      // Non-fatal â€” window might be closing
    }
  }, 5000)
}

function stopPerfMetrics(): void {
  if (perfInterval !== null) {
    clearInterval(perfInterval)
    perfInterval = null
  }
}

async function runStartupStep(errorMessage: string, step: () => Promise<void>): Promise<void> {
  try {
    await step()
  } catch (err) {
    console.error(errorMessage, err)
  }
}

async function startIdeTools(): Promise<void> {
  const toolAddr = await startIdeToolServer()
  console.log(`[main] IDE tool server started at ${toolAddr.address}`)
}

async function startBackgroundServices(win: BrowserWindow): Promise<void> {
  await runStartupStep('[main] failed to start hooks server:', async () => startHooksServer(win))
  await runStartupStep('[main] failed to start IDE tool server:', startIdeTools)
  await runStartupStep('[main] hook installer error:', installHooks)
  await runStartupStep('[main] extensions init error:', initExtensions)
}

function registerRenderProcessCrashLogging(): void {
  app.on('render-process-gone', (_event, _webContents, details) => {
    const msg = `Reason: ${details.reason}\nExitCode: ${details.exitCode}`
    console.error('[crash] render-process-gone:', msg)
    void writeCrashLog('renderer:render-process-gone', msg)
  })
}

function registerAutoUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => broadcastToActiveWindows('updater:event', { type: 'checking-for-update' }))
  autoUpdater.on('update-available', (info: unknown) => broadcastToActiveWindows('updater:event', { type: 'update-available', info }))
  autoUpdater.on('update-not-available', (info: unknown) => broadcastToActiveWindows('updater:event', { type: 'update-not-available', info }))
  autoUpdater.on('download-progress', (progress: unknown) => broadcastToActiveWindows('updater:event', { type: 'download-progress', progress }))
  autoUpdater.on('update-downloaded', (info: unknown) => broadcastToActiveWindows('updater:event', { type: 'update-downloaded', info }))
  autoUpdater.on('error', (err: Error) => broadcastToActiveWindows('updater:event', { type: 'error', error: err.message }))
}

function scheduleAutoUpdateCheck(): void {
  if (!app.isPackaged) {
    return
  }
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.log('[updater] Auto-check failed:', err.message)
    })
  }, 5000)
}

function configureAutoUpdater(): void {
  if (!autoUpdater) {
    return
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  registerAutoUpdaterEvents()
  scheduleAutoUpdateCheck()
}

function registerWindowLifecycleHandlers(): void {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })

  app.on('second-instance', () => {
    const windows = getAllActiveWindows()
    if (windows.length > 0) {
      const win = windows[windows.length - 1]
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

async function initializeApplication(): Promise<void> {
  mainWindow = createWindow()
  buildApplicationMenu(mainWindow)
  await startBackgroundServices(mainWindow)
  registerRenderProcessCrashLogging()
  configureAutoUpdater()
  startPerfMetrics()
  registerWindowLifecycleHandlers()
}

app.setName('Ouroboros')
app.whenReady().then(initializeApplication)

app.on('window-all-closed', async () => {
  stopPerfMetrics()
  await stopHooksServer()
  await stopIdeToolServer()
  cleanupIpcHandlers()
  killAllPtySessions()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Security: prevent new windows from web content (window.open, target=_blank, etc.)
// Note: This does NOT block BrowserWindow creation from the main process (windowManager).
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url)
    const isDev = process.env.NODE_ENV === 'development'
    const isLocalhost = parsedUrl.hostname === 'localhost'
    const isFile = parsedUrl.protocol === 'file:'

    if (!isDev && !isFile) {
      event.preventDefault()
    }
    if (isDev && !isLocalhost && !isFile) {
      event.preventDefault()
    }
  })
})
