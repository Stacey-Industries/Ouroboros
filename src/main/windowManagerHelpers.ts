/**
 * windowManagerHelpers.ts — Extracted helpers for window creation details:
 * Mica/acrylic effects, bounds persistence, CSP setup, and window positioning.
 * Consumed by windowManager.ts.
 */

import { BrowserWindow, screen, session } from 'electron'
import path from 'path'

import type { WindowBounds } from './config'
import { getConfigValue, setConfigValue } from './config'

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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WindowCreationState {
  isFirst: boolean
  savedBounds: WindowBounds | null
  width: number
  height: number
  x?: number
  y?: number
}

// ─── Bounds validation ────────────────────────────────────────────────────────

export function validateBounds(bounds: WindowBounds): WindowBounds | null {
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

// ─── Window positioning ───────────────────────────────────────────────────────

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

// ─── Bounds persistence ───────────────────────────────────────────────────────

export function saveWindowBounds(win: BrowserWindow, isMaximized: boolean): void {
  const { x, y, width, height } = win.getBounds()
  setConfigValue('windowBounds', { x, y, width, height, isMaximized })
}

export function markWindowMaximized(): void {
  const current = getConfigValue('windowBounds')
  setConfigValue('windowBounds', { ...current, isMaximized: true })
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

// ─── Mica / acrylic effects ───────────────────────────────────────────────────

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

// ─── CSP ─────────────────────────────────────────────────────────────────────

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
