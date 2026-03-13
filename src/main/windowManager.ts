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

interface WindowCreationState {
  isFirst: boolean
  savedBounds: WindowBounds | null
  width: number
  height: number
  x?: number
  y?: number
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

function getSavedWindowBounds(isFirst: boolean): WindowBounds | null {
  if (!isFirst) return null
  return getConfigValue('windowBounds')
}

function getInitialWindowSize(bounds: WindowBounds | null): Pick<WindowCreationState, 'width' | 'height'> {
  if (!bounds) {
    return { width: 1280, height: 800 }
  }

  return {
    width: bounds.width,
    height: bounds.height,
  }
}

function getInitialWindowPlacement(bounds: WindowBounds | null, isFirst: boolean): Pick<WindowCreationState, 'x' | 'y'> {
  if (bounds?.x !== undefined && bounds.y !== undefined) {
    return { x: bounds.x, y: bounds.y }
  }

  if (isFirst) return {}
  return getCascadeOffset()
}

function getWindowCreationState(): WindowCreationState {
  const isFirst = windows.size === 0
  const savedBounds = getSavedWindowBounds(isFirst)
  const validatedBounds = savedBounds ? validateBounds(savedBounds) : null
  const size = getInitialWindowSize(validatedBounds)
  const placement = getInitialWindowPlacement(validatedBounds, isFirst)

  return {
    isFirst,
    savedBounds,
    width: size.width,
    height: size.height,
    x: placement.x,
    y: placement.y,
  }
}

function getWindowPosition(state: WindowCreationState): { x?: number; y?: number } {
  if (state.x === undefined || state.y === undefined) return {}
  return { x: state.x, y: state.y }
}

function createBrowserWindow(preloadPath: string, state: WindowCreationState): BrowserWindow {
  return new BrowserWindow({
    width: state.width,
    height: state.height,
    ...getWindowPosition(state),
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
}

function registerManagedWindow(win: BrowserWindow, projectRoot?: string): number {
  const winId = win.id

  windows.set(winId, {
    id: winId,
    win,
    projectRoot: projectRoot ?? null,
  })
  windowCleanups.set(winId, registerIpcHandlers(win))

  return winId
}

function loadWindowContent(win: BrowserWindow): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    win.loadURL(rendererUrl)
    return
  }

  win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function openDevToolsInDevelopment(win: BrowserWindow): void {
  if (process.env.NODE_ENV !== 'development') return
  win.webContents.openDevTools({ mode: 'detach' })
}

function setupReadyToShow(win: BrowserWindow, state: WindowCreationState): void {
  win.once('ready-to-show', () => {
    if (state.isFirst && state.savedBounds?.isMaximized) {
      win.maximize()
    }
    win.show()
    openDevToolsInDevelopment(win)
  })
}

function clearBoundsTimer(winId: number): void {
  const timer = boundsTimers.get(winId)
  if (timer === undefined) return
  clearTimeout(timer)
  boundsTimers.delete(winId)
}

function saveWindowBounds(win: BrowserWindow, isMaximized: boolean): void {
  const { x, y, width, height } = win.getBounds()
  setConfigValue('windowBounds', { x, y, width, height, isMaximized })
}

function markWindowMaximized(): void {
  const current = getConfigValue('windowBounds')
  setConfigValue('windowBounds', { ...current, isMaximized: true })
}

function createBoundsSaveHandler(win: BrowserWindow, winId: number): () => void {
  return () => {
    clearBoundsTimer(winId)
    boundsTimers.set(
      winId,
      setTimeout(() => {
        boundsTimers.delete(winId)
        if (win.isDestroyed() || win.isMaximized()) return
        saveWindowBounds(win, false)
      }, 500)
    )
  }
}

function setupWindowBoundsHandlers(win: BrowserWindow, winId: number): void {
  const scheduleSaveBounds = createBoundsSaveHandler(win, winId)

  win.on('resize', scheduleSaveBounds)
  win.on('move', scheduleSaveBounds)
  win.on('maximize', markWindowMaximized)
  win.on('unmaximize', () => {
    saveWindowBounds(win, false)
  })
}

function cleanupIpcHandlers(winId: number): void {
  const cleanup = windowCleanups.get(winId)
  if (!cleanup) return
  cleanup()
  windowCleanups.delete(winId)
}

function setupWindowCloseHandler(win: BrowserWindow, winId: number): void {
  win.on('close', () => {
    clearBoundsTimer(winId)
    if (!win.isMaximized()) {
      saveWindowBounds(win, false)
    }
    cleanupIpcHandlers(winId)
    killPtySessionsForWindow(winId)
    windows.delete(winId)
  })
}

function setupWindowLifecycle(win: BrowserWindow, winId: number, state: WindowCreationState): void {
  setupReadyToShow(win, state)
  setupWindowBoundsHandlers(win, winId)
  setupWindowCloseHandler(win, winId)
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
  const state = getWindowCreationState()
  const preloadPath = path.join(__dirname, '../preload/index.js')
  const win = createBrowserWindow(preloadPath, state)
  const winId = registerManagedWindow(win, projectRoot)

  loadWindowContent(win)
  setupWindowLifecycle(win, winId, state)

  // ── Debounced bounds persistence (only for the focused window) ────────────

  // ── Cleanup on close ──────────────────────────────────────────────────────

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
