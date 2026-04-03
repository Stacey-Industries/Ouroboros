/**
 * windowManagerHelpers.ts — Extracted helpers for window creation details:
 * Mica/acrylic effects, bounds persistence, CSP setup, and window positioning.
 * Consumed by windowManager.ts.
 */

import { BrowserWindow, screen, session } from 'electron'
import path from 'path'

import type { WindowBounds } from './config'
import { getConfigValue, setConfigValue } from './config'
import { describeFdPressure } from './fdPressureDiagnostics'
import log from './logger'

// mica-electron: native Windows DWM acrylic/mica effects.
// Wrapped in try/catch because mica-electron calls app.commandLine at module
// load time, which throws outside a real Electron process (e.g. in tests).
export const MicaBrowserWindow = (() => {
  if (process.platform !== 'win32') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('mica-electron') as { MicaBrowserWindow: typeof BrowserWindow }).MicaBrowserWindow
  } catch {
    return null
  }
})()

/** Resolve the `out/main/` directory. electron-vite may code-split into `out/main/chunks/`. */
export const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname

export interface WindowCreationState {
  isFirst: boolean
  savedBounds: WindowBounds | null
  width: number
  height: number
  x?: number
  y?: number
}

export function validateBounds(bounds: WindowBounds): WindowBounds | null {
  if (bounds.x === undefined || bounds.y === undefined) return null

  const displays = screen.getAllDisplays()
  const isOnScreen = displays.some((display) => {
    const { x, y, width, height } = display.workArea
    return (
      bounds.x >= x &&
      bounds.y >= y &&
      bounds.x + bounds.width <= x + width &&
      bounds.y + bounds.height <= y + height
    )
  })

  return isOnScreen ? bounds : null
}

export function getCascadeOffset(windowCount: number): { x?: number; y?: number } {
  if (windowCount === 0) return {}
  return { x: 40 + windowCount * 30, y: 40 + windowCount * 30 }
}

export function getInitialWindowSize(
  bounds: WindowBounds | null,
): Pick<WindowCreationState, 'width' | 'height'> {
  if (!bounds) return { width: 1280, height: 800 }
  return { width: bounds.width, height: bounds.height }
}

export function getInitialWindowPlacement(
  bounds: WindowBounds | null,
  isFirst: boolean,
  windowCount: number,
): Pick<WindowCreationState, 'x' | 'y'> {
  if (bounds?.x !== undefined && bounds.y !== undefined) {
    return { x: bounds.x, y: bounds.y }
  }
  if (isFirst) return {}
  return getCascadeOffset(windowCount)
}

const boundsRetryTimers = new Map<number, ReturnType<typeof setTimeout>>()
const boundsRetryAttempts = new Map<number, number>()
const BOUNDS_RETRY_BASE_DELAY_MS = 500
const BOUNDS_RETRY_MAX_DELAY_MS = 5_000
const BOUNDS_EMFILE_LOG_THROTTLE_MS = 10_000

let lastBoundsEmfileLogAt = 0

function clearBoundsRetry(winId: number): void {
  const timer = boundsRetryTimers.get(winId)
  if (timer !== undefined) {
    clearTimeout(timer)
    boundsRetryTimers.delete(winId)
  }
  boundsRetryAttempts.delete(winId)
}

function scheduleBoundsRetry(win: BrowserWindow, isMaximized: boolean): void {
  const winId = win.id
  if (boundsRetryTimers.has(winId)) return

  const attempt = (boundsRetryAttempts.get(winId) ?? 0) + 1
  boundsRetryAttempts.set(winId, attempt)
  const delay = Math.min(BOUNDS_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), BOUNDS_RETRY_MAX_DELAY_MS)

  boundsRetryTimers.set(
    winId,
    setTimeout(() => {
      boundsRetryTimers.delete(winId)
      if (win.isDestroyed()) {
        boundsRetryAttempts.delete(winId)
        return
      }
      saveWindowBounds(win, isMaximized)
    }, delay),
  )
}

export function saveWindowBounds(win: BrowserWindow, isMaximized: boolean): boolean {
  try {
    const { x, y, width, height } = win.getBounds()
    setConfigValue('windowBounds', { x, y, width, height, isMaximized })
    clearBoundsRetry(win.id)
    return true
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EMFILE') {
      const now = Date.now()
      if (now - lastBoundsEmfileLogAt >= BOUNDS_EMFILE_LOG_THROTTLE_MS) {
        lastBoundsEmfileLogAt = now
        log.warn(`[bounds] EMFILE — deferring write (${describeFdPressure()})`)
      }
      scheduleBoundsRetry(win, isMaximized)
    } else {
      log.error('[bounds] Failed to save window bounds:', err)
    }
    return false
  }
}

export function markWindowMaximized(): void {
  try {
    const current = getConfigValue('windowBounds')
    setConfigValue('windowBounds', { ...current, isMaximized: true })
  } catch (err: unknown) {
    log.warn('[bounds] Failed to mark maximized:', err)
  }
}

export function createBoundsSaveHandler(
  win: BrowserWindow,
  winId: number,
  boundsTimers: Map<number, ReturnType<typeof setTimeout>>,
): () => void {
  return () => {
    const existing = boundsTimers.get(winId)
    if (existing !== undefined) {
      clearTimeout(existing)
      boundsTimers.delete(winId)
    }
    boundsTimers.set(
      winId,
      setTimeout(() => {
        boundsTimers.delete(winId)
        if (win.isDestroyed() || win.isMaximized()) return
        saveWindowBounds(win, false)
      }, 500),
    )
  }
}

export function applyMicaEffect(win: BrowserWindow): void {
  if (!(process.platform === 'win32' && MicaBrowserWindow && win instanceof MicaBrowserWindow)) {
    return
  }
  // MicaBrowserWindow adds extra methods not present in Electron's BrowserWindow typedefs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const micaWin = win as any
  micaWin.setDarkTheme()
  micaWin.setMicaAcrylicEffect()
  micaWin.setRoundedCorner()
  // Toggle alwaysFocused per-window so the active window keeps vibrant
  // acrylic while inactive windows dim naturally. This avoids the DWM
  // focus-fight flashing that occurs when multiple windows all claim
  // alwaysFocused(true) simultaneously.
  micaWin.alwaysFocused(true)
  win.on('focus', () => { micaWin.alwaysFocused(true) })
  win.on('blur', () => { micaWin.alwaysFocused(false) })
}

let cspInstalled = false

export function ensureCSP(): void {
  if (cspInstalled) return
  cspInstalled = true

  const isDev = process.env.NODE_ENV === 'development'
  const webPort = isDev ? '*' : String((getConfigValue('webAccessPort') as number) ?? 7890)

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
            "img-src 'self' data: blob: https:",
            `connect-src 'self' ws://localhost:${webPort} http://localhost:${webPort}`,
            "worker-src 'self' blob:",
          ].join('; '),
        ],
      },
    })
  })
}
