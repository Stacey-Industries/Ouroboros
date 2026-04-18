/**
 * windowManagerHelpers.ts — Extracted helpers for window creation details:
 * Mica/acrylic effects, bounds persistence, CSP setup, and window positioning.
 * Consumed by windowManager.ts.
 */

import { BrowserWindow, screen, session } from 'electron';
import path from 'path';

import type { WindowBounds, WindowSession } from './config';
import { getConfigValue, setConfigValue } from './config';
import { describeFdPressure } from './fdPressureDiagnostics';
import log from './logger';
import { markStartup } from './perfMetrics';
import type { Session } from './session/session';

// mica-electron: native Windows DWM acrylic/mica effects.
// Wrapped in try/catch because mica-electron calls app.commandLine at module
// load time, which throws outside a real Electron process (e.g. in tests).
export const MicaBrowserWindow = (() => {
  if (process.platform !== 'win32') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('mica-electron') as { MicaBrowserWindow: typeof BrowserWindow })
      .MicaBrowserWindow;
  } catch {
    return null;
  }
})();

/** Resolve the `out/main/` directory. electron-vite may code-split into `out/main/chunks/`. */
export const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;

export interface WindowCreationState {
  isFirst: boolean;
  savedBounds: WindowBounds | null;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export function validateBounds(bounds: WindowBounds): WindowBounds | null {
  if (bounds.x === undefined || bounds.y === undefined) return null;
  const bx = bounds.x;
  const by = bounds.y;

  const displays = screen.getAllDisplays();
  const isOnScreen = displays.some((display) => {
    const { x, y, width, height } = display.workArea;
    return bx >= x && by >= y && bx + bounds.width <= x + width && by + bounds.height <= y + height;
  });

  return isOnScreen ? bounds : null;
}

export function getCascadeOffset(windowCount: number): { x?: number; y?: number } {
  if (windowCount === 0) return {};
  return { x: 40 + windowCount * 30, y: 40 + windowCount * 30 };
}

export function getInitialWindowSize(
  bounds: WindowBounds | null,
): Pick<WindowCreationState, 'width' | 'height'> {
  if (!bounds) return { width: 1280, height: 800 };
  return { width: bounds.width, height: bounds.height };
}

export function getInitialWindowPlacement(
  bounds: WindowBounds | null,
  isFirst: boolean,
  windowCount: number,
): Pick<WindowCreationState, 'x' | 'y'> {
  if (bounds?.x !== undefined && bounds.y !== undefined) {
    return { x: bounds.x, y: bounds.y };
  }
  if (isFirst) return {};
  return getCascadeOffset(windowCount);
}

const boundsRetryTimers = new Map<number, ReturnType<typeof setTimeout>>();
const boundsRetryAttempts = new Map<number, number>();
const BOUNDS_RETRY_BASE_DELAY_MS = 500;
const BOUNDS_RETRY_MAX_DELAY_MS = 5_000;
const BOUNDS_EMFILE_LOG_THROTTLE_MS = 10_000;

let lastBoundsEmfileLogAt = 0;

function clearBoundsRetry(winId: number): void {
  const timer = boundsRetryTimers.get(winId);
  if (timer !== undefined) {
    clearTimeout(timer);
    boundsRetryTimers.delete(winId);
  }
  boundsRetryAttempts.delete(winId);
}

function scheduleBoundsRetry(win: BrowserWindow, isMaximized: boolean): void {
  const winId = win.id;
  if (boundsRetryTimers.has(winId)) return;

  const attempt = (boundsRetryAttempts.get(winId) ?? 0) + 1;
  boundsRetryAttempts.set(winId, attempt);
  const delay = Math.min(
    BOUNDS_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
    BOUNDS_RETRY_MAX_DELAY_MS,
  );

  boundsRetryTimers.set(
    winId,
    setTimeout(() => {
      boundsRetryTimers.delete(winId);
      if (win.isDestroyed()) {
        boundsRetryAttempts.delete(winId);
        return;
      }
      saveWindowBounds(win, isMaximized);
    }, delay),
  );
}

export function saveWindowBounds(win: BrowserWindow, isMaximized: boolean): boolean {
  try {
    const { x, y, width, height } = win.getBounds();
    setConfigValue('windowBounds', { x, y, width, height, isMaximized });
    clearBoundsRetry(win.id);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EMFILE') {
      const now = Date.now();
      if (now - lastBoundsEmfileLogAt >= BOUNDS_EMFILE_LOG_THROTTLE_MS) {
        lastBoundsEmfileLogAt = now;
        log.warn(`[bounds] EMFILE — deferring write (${describeFdPressure()})`);
      }
      scheduleBoundsRetry(win, isMaximized);
    } else {
      log.error('[bounds] Failed to save window bounds:', err);
    }
    return false;
  }
}

export function markWindowMaximized(): void {
  try {
    const current = getConfigValue('windowBounds');
    setConfigValue('windowBounds', { ...current, isMaximized: true });
  } catch (err: unknown) {
    log.warn('[bounds] Failed to mark maximized:', err);
  }
}

export function createBoundsSaveHandler(
  win: BrowserWindow,
  winId: number,
  boundsTimers: Map<number, ReturnType<typeof setTimeout>>,
): () => void {
  return () => {
    const existing = boundsTimers.get(winId);
    if (existing !== undefined) {
      clearTimeout(existing);
      boundsTimers.delete(winId);
    }
    boundsTimers.set(
      winId,
      setTimeout(() => {
        boundsTimers.delete(winId);
        if (win.isDestroyed() || win.isMaximized()) return;
        saveWindowBounds(win, false);
      }, 500),
    );
  };
}

export function applyMicaEffect(win: BrowserWindow): void {
  if (!(process.platform === 'win32' && MicaBrowserWindow && win instanceof MicaBrowserWindow)) {
    return;
  }
  // MicaBrowserWindow adds extra methods not present in Electron's BrowserWindow typedefs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const micaWin = win as any;
  micaWin.setDarkTheme();
  micaWin.setMicaAcrylicEffect();
  micaWin.setRoundedCorner();
  // Toggle alwaysFocused per-window so the active window keeps vibrant
  // acrylic while inactive windows dim naturally. This avoids the DWM
  // focus-fight flashing that occurs when multiple windows all claim
  // alwaysFocused(true) simultaneously.
  micaWin.alwaysFocused(true);
  win.on('focus', () => {
    micaWin.alwaysFocused(true);
  });
  win.on('blur', () => {
    micaWin.alwaysFocused(false);
  });
}

let cspInstalled = false;

function buildConnectSources(isDev: boolean): string {
  const configuredPort = String((getConfigValue('webAccessPort') as number) ?? 7890);
  const sources = [`ws://localhost:${configuredPort}`, `http://localhost:${configuredPort}`];

  if (isDev) {
    // Derive the Vite dev server port from ELECTRON_RENDERER_URL (set by electron-vite)
    // or fall back to the electron-vite default of 5173.
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
    const devPort = rendererUrl ? new URL(rendererUrl).port || '5173' : '5173';
    if (devPort !== configuredPort) {
      sources.push(`ws://localhost:${devPort}`, `http://localhost:${devPort}`);
    }
  }

  return `'self' ${sources.join(' ')}`;
}

// ─── Window show / dev-tools ─────────────────────────────────────────────────

export function openDevToolsInDevelopment(win: BrowserWindow): void {
  if (process.env.NODE_ENV !== 'development') return;
  win.webContents.openDevTools({ mode: 'detach' });
}

export function setupReadyToShow(win: BrowserWindow, state: WindowCreationState): void {
  win.once('ready-to-show', () => {
    markStartup('window-ready');
    if (state.isFirst && state.savedBounds?.isMaximized) win.maximize();
    win.show();
    openDevToolsInDevelopment(win);
  });
}

export function loadWindowContent(win: BrowserWindow): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
    return;
  }
  void win.loadFile(path.join(outMainDir, '../renderer/index.html'));
}

export function ensureCSP(): void {
  if (cspInstalled) return;
  cspInstalled = true;

  const isDev = process.env.NODE_ENV === 'development';
  const connectSources = buildConnectSources(isDev);

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
            `connect-src ${connectSources}`,
            "worker-src 'self' blob:",
          ].join('; '),
        ],
      },
    });
  });
}

// ─── Session persistence helpers (Wave 40 Phase D) ──────────────────────────

/** Capture current bounds + maximized state from a live BrowserWindow. */
export function captureWindowBounds(win: BrowserWindow): Session['bounds'] {
  const b = win.getBounds();
  return { ...b, isMaximized: win.isMaximized() };
}

/** Apply persisted bounds to a window, validating against current display geometry. */
export function applyPersistedBounds(win: BrowserWindow, bounds: WindowSession['bounds']): void {
  if (!bounds) return;
  const v = validateBounds(bounds);
  if (!v) return;
  win.setBounds({ x: v.x, y: v.y, width: v.width, height: v.height });
  if (v.isMaximized) win.maximize();
}

/**
 * Merge live bounds (keyed by projectRoot) into an existing sessionsData array.
 * Returns a new array; does not mutate the input.
 */
export function mergeBoundsIntoSessions(
  existing: Session[],
  byRoot: Map<string, Session['bounds']>,
): Session[] {
  return existing.map((s) => {
    const updated = byRoot.get(s.projectRoot);
    return updated ? { ...s, bounds: updated } : s;
  });
}

/**
 * Project active Session records that have bounds into WindowSession shape
 * for use by the window restore path.
 */
export function sessionsDataToWindowSessions(sessionsData: Session[]): WindowSession[] {
  return sessionsData
    .filter((s) => s.projectRoot && s.bounds)
    .map((s) => ({ projectRoots: [s.projectRoot], bounds: s.bounds }));
}
