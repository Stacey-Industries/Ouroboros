/**
 * windowManager.ts — Multi-window lifecycle management.
 *
 * Tracks all open BrowserWindows, maps them to project roots,
 * and provides helpers for creating, focusing, and listing windows.
 */

import { BrowserWindow, screen, session } from 'electron'
import path from 'path'
import { getConfigValue, setConfigValue } from './config'
import type { WindowBounds } from './config'
import { registerIpcHandlers } from './ipc'
import { killPtySessionsForWindow } from './pty'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ManagedWindow {
  id: number
  win: BrowserWindow
  projectRoot: string | null
}

export interface WindowInfo {
  id: number
  projectRoot: string | null
}

// ─── State ───────────────────────────────────────────────────────────────────

const windows = new Map<number, ManagedWindow>()

// Per-window IPC cleanup functions
const windowCleanups = new Map<number, () => void>()

// Per-window bounds-save timers
const boundsTimers = new Map<number, ReturnType<typeof setTimeout>>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** Offset new window positions so they cascade instead of stacking. */
function getCascadeOffset(): { x?: number; y?: number } {
  const count = windows.size
  if (count === 0) return {}
  return { x: 40 + count * 30, y: 40 + count * 30 }
}

// ─── CSP (only install once) ─────────────────────────────────────────────────

let cspInstalled = false

function ensureCSP(): void {
  if (cspInstalled) return
  cspInstalled = true

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
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
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Creates a new BrowserWindow, registers IPC handlers for it,
 * and adds it to the managed windows map.
 */
export function createWindow(projectRoot?: string): BrowserWindow {
  ensureCSP()

  const preloadPath = path.join(__dirname, '../preload/index.js')

  // For the first window, restore saved bounds. For subsequent windows, cascade.
  const isFirst = windows.size === 0
  const savedBounds = isFirst ? getConfigValue('windowBounds') : null
  const validatedBounds = savedBounds ? validateBounds(savedBounds) : null
  const cascade = isFirst ? {} : getCascadeOffset()

  const initialWidth = validatedBounds?.width ?? 1280
  const initialHeight = validatedBounds?.height ?? 800
  const initialX = validatedBounds?.x ?? cascade.x
  const initialY = validatedBounds?.y ?? cascade.y

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

  const winId = win.id

  // Track this window
  const managed: ManagedWindow = {
    id: winId,
    win,
    projectRoot: projectRoot ?? null,
  }
  windows.set(winId, managed)

  // Register per-window IPC handlers
  const cleanup = registerIpcHandlers(win)
  windowCleanups.set(winId, cleanup)

  // Dev vs production loading
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Show when ready
  win.once('ready-to-show', () => {
    if (isFirst && savedBounds?.isMaximized) {
      win.maximize()
    }
    win.show()
    if (process.env.NODE_ENV === 'development') {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // ── Debounced bounds persistence (only for the focused window) ────────────

  function scheduleSaveBounds(): void {
    const existing = boundsTimers.get(winId)
    if (existing !== undefined) clearTimeout(existing)
    boundsTimers.set(
      winId,
      setTimeout(() => {
        boundsTimers.delete(winId)
        if (win.isDestroyed() || win.isMaximized()) return
        const { x, y, width, height } = win.getBounds()
        setConfigValue('windowBounds', { x, y, width, height, isMaximized: false })
      }, 500)
    )
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

  // ── Cleanup on close ──────────────────────────────────────────────────────

  win.on('close', () => {
    // Cancel pending save
    const timer = boundsTimers.get(winId)
    if (timer !== undefined) {
      clearTimeout(timer)
      boundsTimers.delete(winId)
    }
    // Final bounds save
    if (!win.isMaximized()) {
      const { x, y, width, height } = win.getBounds()
      setConfigValue('windowBounds', { x, y, width, height, isMaximized: false })
    }
    // Cleanup IPC handlers for this window
    const ipcCleanup = windowCleanups.get(winId)
    if (ipcCleanup) {
      ipcCleanup()
      windowCleanups.delete(winId)
    }
    // Kill PTY sessions associated with this window
    killPtySessionsForWindow(winId)
    // Remove from tracked windows
    windows.delete(winId)
  })

  return win
}

export function getWindow(id: number): ManagedWindow | undefined {
  return windows.get(id)
}

export function getAllWindows(): ManagedWindow[] {
  return Array.from(windows.values())
}

export function getWindowInfos(): WindowInfo[] {
  return Array.from(windows.values()).map((mw) => ({
    id: mw.id,
    projectRoot: mw.projectRoot,
  }))
}

export function setWindowProjectRoot(winId: number, projectRoot: string): void {
  const managed = windows.get(winId)
  if (managed) {
    managed.projectRoot = projectRoot
  }
}

export function closeWindow(id: number): void {
  const managed = windows.get(id)
  if (managed && !managed.win.isDestroyed()) {
    managed.win.close()
  }
}

/**
 * If a window already exists for the given project root, focus it.
 * Otherwise, create a new window.
 */
export function focusOrCreateWindow(projectRoot: string): BrowserWindow {
  for (const managed of windows.values()) {
    if (managed.projectRoot === projectRoot && !managed.win.isDestroyed()) {
      if (managed.win.isMinimized()) managed.win.restore()
      managed.win.focus()
      return managed.win
    }
  }
  return createWindow(projectRoot)
}

export function focusWindow(id: number): void {
  const managed = windows.get(id)
  if (managed && !managed.win.isDestroyed()) {
    if (managed.win.isMinimized()) managed.win.restore()
    managed.win.focus()
  }
}

export function getWindowCount(): number {
  return windows.size
}

/**
 * Get the first managed window (used for hooks server broadcast target).
 * Returns all non-destroyed windows for broadcasting.
 */
export function getAllActiveWindows(): BrowserWindow[] {
  const result: BrowserWindow[] = []
  for (const managed of windows.values()) {
    if (!managed.win.isDestroyed()) {
      result.push(managed.win)
    }
  }
  return result
}
