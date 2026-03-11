import { app, BrowserWindow, session, screen } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { registerIpcHandlers, cleanupIpcHandlers } from './ipc'
import { killAllPtySessions } from './pty'
import { startHooksServer, stopHooksServer } from './hooks'
import { installHooks } from './hookInstaller'
import { buildApplicationMenu } from './menu'
import { getConfigValue, setConfigValue } from './config'
import type { WindowBounds } from './config'

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

/**
 * Validate that the saved window bounds are still visible on one of the
 * currently connected displays. Returns the bounds if valid, null otherwise.
 */
function validateBounds(bounds: WindowBounds): WindowBounds | null {
  if (bounds.x === undefined || bounds.y === undefined) return null

  const displays = screen.getAllDisplays()
  const isOnScreen = displays.some((display) => {
    const { x, y, width, height } = display.workArea
    return (
      bounds.x! >= x &&
      bounds.y! >= y &&
      bounds.x! + bounds.width <= x + width &&
      bounds.y! + bounds.height <= y + height
    )
  })

  return isOnScreen ? bounds : null
}

function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/index.js')

  // Restore saved window bounds
  const savedBounds = getConfigValue('windowBounds')
  const validatedBounds = savedBounds ? validateBounds(savedBounds) : null
  const initialWidth = validatedBounds?.width ?? 1280
  const initialHeight = validatedBounds?.height ?? 800
  const initialX = validatedBounds?.x
  const initialY = validatedBounds?.y

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    ...(initialX !== undefined && initialY !== undefined ? { x: initialX, y: initialY } : {}),
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            color: '#0d1117',
            symbolColor: '#e6edf3',
            height: 32
          }
        : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  })

  // CSP — strict for production
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", // unsafe-inline for xterm; wasm-unsafe-eval for Shiki syntax highlighter
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "img-src 'self' data: blob:",
            "connect-src 'self' ws://localhost:* http://localhost:*",
            "worker-src blob:"
          ].join('; ')
        ]
      }
    })
  })

  // Dev vs production loading
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Show only when ready to avoid white flash
  win.once('ready-to-show', () => {
    // Restore maximized state after showing so bounds are applied first
    if (savedBounds?.isMaximized) {
      win.maximize()
    }
    win.show()
    if (process.env.NODE_ENV === 'development') {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Debounced save of window bounds on resize/move
  let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleSaveBounds(): void {
    if (saveBoundsTimer !== null) clearTimeout(saveBoundsTimer)
    saveBoundsTimer = setTimeout(() => {
      saveBoundsTimer = null
      if (win.isMaximized()) return // Don't overwrite bounds when maximized
      const { x, y, width, height } = win.getBounds()
      setConfigValue('windowBounds', { x, y, width, height, isMaximized: false })
    }, 500)
  }

  win.on('resize', scheduleSaveBounds)
  win.on('move', scheduleSaveBounds)

  win.on('maximize', () => {
    const current = getConfigValue('windowBounds')
    setConfigValue('windowBounds', { ...current, isMaximized: true })
  })

  win.on('unmaximize', () => {
    const { x, y, width, height } = win.getBounds()
    setConfigValue('windowBounds', { x, y, width, height, isMaximized: false })
  })

  win.on('close', () => {
    // Cancel any pending save and do a final synchronous bounds save
    if (saveBoundsTimer !== null) {
      clearTimeout(saveBoundsTimer)
      saveBoundsTimer = null
    }
    if (!win.isMaximized()) {
      const { x, y, width, height } = win.getBounds()
      setConfigValue('windowBounds', { x, y, width, height, isMaximized: false })
    }
    cleanupIpcHandlers()
    killAllPtySessions()
  })

  return win
}

// ─── Performance metrics ──────────────────────────────────────────────────────

let perfInterval: ReturnType<typeof setInterval> | null = null

function startPerfMetrics(win: BrowserWindow): void {
  if (perfInterval !== null) return
  perfInterval = setInterval(() => {
    if (win.isDestroyed()) return
    try {
      const mem = process.memoryUsage()
      const appMetrics = app.getAppMetrics()
      win.webContents.send('perf:metrics', {
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
  mainWindow = createWindow()

  buildApplicationMenu(mainWindow)
  registerIpcHandlers(mainWindow)

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

  // ── Render-process crash logging ───────────────────────────────────────────
  app.on('render-process-gone', (_event, _webContents, details) => {
    const msg = `Reason: ${details.reason}\nExitCode: ${details.exitCode}`
    console.error('[crash] render-process-gone:', msg)
    void writeCrashLog('renderer:render-process-gone', msg)
  })

  // ── Auto-updater setup ─────────────────────────────────────────────────────
  if (autoUpdater) {
    const win = mainWindow
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      win.webContents.send('updater:event', { type: 'checking-for-update' })
    })
    autoUpdater.on('update-available', (info: unknown) => {
      win.webContents.send('updater:event', { type: 'update-available', info })
    })
    autoUpdater.on('update-not-available', (info: unknown) => {
      win.webContents.send('updater:event', { type: 'update-not-available', info })
    })
    autoUpdater.on('download-progress', (progress: unknown) => {
      win.webContents.send('updater:event', { type: 'download-progress', progress })
    })
    autoUpdater.on('update-downloaded', (info: unknown) => {
      win.webContents.send('updater:event', { type: 'update-downloaded', info })
    })
    autoUpdater.on('error', (err: Error) => {
      win.webContents.send('updater:event', { type: 'error', error: err.message })
    })
  }

  // ── Performance metrics ────────────────────────────────────────────────────
  startPerfMetrics(mainWindow)

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })

  // Second instance focus
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
})

app.on('window-all-closed', async () => {
  stopPerfMetrics()
  await stopHooksServer()
  killAllPtySessions()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Security: prevent new windows
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
