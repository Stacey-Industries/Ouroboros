import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { registerIpcHandlers, cleanupIpcHandlers } from './ipc'
import { killAllPtySessions } from './pty'
import { startHooksServer, stopHooksServer } from './hooks'
import { installHooks } from './hookInstaller'
import { initExtensions } from './extensions'
import { buildApplicationMenu } from './menu'
import { createWindow, getAllActiveWindows } from './windowManager'

// ─── Auto-updater (electron-updater — optional dep) ───────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater: any = null
try {
  // electron-updater is an optional dependency; gracefully skip if absent
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updaterModule = require('electron-updater')
  autoUpdater = updaterModule.autoUpdater
} catch {
  console.log('[updater] electron-updater not installed — auto-update disabled')
}

// ─── Crash logging ────────────────────────────────────────────────────────────

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

// ─── Performance metrics ──────────────────────────────────────────────────────

let perfInterval: ReturnType<typeof setInterval> | null = null

/** Broadcasts perf metrics to all open windows. */
function startPerfMetrics(): void {
  if (perfInterval !== null) return
  perfInterval = setInterval(() => {
    try {
      const mem = process.memoryUsage()
      const appMetrics = app.getAppMetrics()
      const payload = {
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
      }
      for (const win of getAllActiveWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('perf:metrics', payload)
        }
      }
    } catch {
      // Non-fatal — window might be closing
    }
  }, 5000)
}

function stopPerfMetrics(): void {
  if (perfInterval !== null) {
    clearInterval(perfInterval)
    perfInterval = null
  }
}

app.setName('Ouroboros')

app.whenReady().then(async () => {
  // Create the first window via the window manager
  mainWindow = createWindow()

  buildApplicationMenu(mainWindow)

  // IPC handlers are registered globally inside createWindow() via the
  // window manager. The call below is a no-op for additional windows but
  // ensures the first registration happens for the initial window.
  // (createWindow already calls registerIpcHandlers internally.)

  try {
    await startHooksServer(mainWindow)
  } catch (err) {
    console.error('[main] failed to start hooks server:', err)
  }

  try {
    await installHooks()
  } catch (err) {
    console.error('[main] hook installer error:', err)
  }

  try {
    await initExtensions()
  } catch (err) {
    console.error('[main] extensions init error:', err)
  }

  // ── Render-process crash logging ───────────────────────────────────────────
  app.on('render-process-gone', (_event, _webContents, details) => {
    const msg = `Reason: ${details.reason}\nExitCode: ${details.exitCode}`
    console.error('[crash] render-process-gone:', msg)
    void writeCrashLog('renderer:render-process-gone', msg)
  })

  // ── Auto-updater setup — broadcast to all windows ─────────────────────────
  if (autoUpdater) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    const broadcastUpdater = (payload: unknown) => {
      for (const win of getAllActiveWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('updater:event', payload)
        }
      }
    }

    autoUpdater.on('checking-for-update', () => {
      broadcastUpdater({ type: 'checking-for-update' })
    })
    autoUpdater.on('update-available', (info: unknown) => {
      broadcastUpdater({ type: 'update-available', info })
    })
    autoUpdater.on('update-not-available', (info: unknown) => {
      broadcastUpdater({ type: 'update-not-available', info })
    })
    autoUpdater.on('download-progress', (progress: unknown) => {
      broadcastUpdater({ type: 'download-progress', progress })
    })
    autoUpdater.on('update-downloaded', (info: unknown) => {
      broadcastUpdater({ type: 'update-downloaded', info })
    })
    autoUpdater.on('error', (err: Error) => {
      broadcastUpdater({ type: 'error', error: err.message })
    })
  }

  // ── Performance metrics ────────────────────────────────────────────────────
  startPerfMetrics()

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })

  // Second instance focus — focus most recent window
  app.on('second-instance', () => {
    const windows = getAllActiveWindows()
    if (windows.length > 0) {
      const win = windows[windows.length - 1]
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
})

app.on('window-all-closed', async () => {
  stopPerfMetrics()
  await stopHooksServer()
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
