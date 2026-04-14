/**
 * windowManager.ts — Multi-window lifecycle management.
 *
 * Tracks all open BrowserWindows, maps them to project roots,
 * and provides helpers for creating, focusing, and listing windows.
 */

import { BrowserWindow } from 'electron';
import path from 'path';

import { acquireGraphController, releaseGraphController } from './codebaseGraph/graphController';
import { getConfigValue, setConfigValue, type WindowSession } from './config';
import { acquireContextLayer, releaseContextLayer } from './contextLayer/contextLayerController';
import { registerIpcHandlers } from './ipc';
import { markStartup } from './perfMetrics';
import { killPtySessionsForWindow } from './pty';
import {
  applyMicaEffect,
  createBoundsSaveHandler,
  ensureCSP,
  getInitialWindowPlacement,
  getInitialWindowSize,
  markWindowMaximized,
  MicaBrowserWindow,
  outMainDir,
  saveWindowBounds,
  validateBounds,
  type WindowCreationState,
} from './windowManagerHelpers';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ManagedWindow {
  id: number;
  win: BrowserWindow;
  projectRoot: string | null;
  projectRoots: string[];
}

export interface WindowInfo {
  id: number;
  projectRoot: string | null;
  projectRoots: string[];
}

// ─── State ───────────────────────────────────────────────────────────────────

const windows = new Map<number, ManagedWindow>();

// Per-window IPC cleanup functions
const windowCleanups = new Map<number, () => void>();

// Per-window bounds-save timers
const boundsTimers = new Map<number, ReturnType<typeof setTimeout>>();

// ─── Private helpers ──────────────────────────────────────────────────────────

function getSavedWindowBounds(isFirst: boolean) {
  if (!isFirst) return null;
  return getConfigValue('windowBounds');
}

function getWindowCreationState(): WindowCreationState {
  const isFirst = windows.size === 0;
  const savedBounds = getSavedWindowBounds(isFirst);
  const validatedBounds = savedBounds ? validateBounds(savedBounds) : null;
  const size = getInitialWindowSize(validatedBounds);
  const placement = getInitialWindowPlacement(validatedBounds, isFirst, windows.size);
  return { isFirst, savedBounds, width: size.width, height: size.height, ...placement };
}

function createBrowserWindow(preloadPath: string, state: WindowCreationState): BrowserWindow {
  const WindowClass =
    MicaBrowserWindow && process.platform === 'win32' ? MicaBrowserWindow : BrowserWindow;

  const position = state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {};

  const win = new WindowClass({
    width: state.width,
    height: state.height,
    ...position,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#00000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    frame: process.platform !== 'darwin' ? false : undefined,
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window' as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  applyMicaEffect(win);
  return win;
}

function seedProjectRoots(projectRoot: string | undefined): string[] {
  if (projectRoot) return [projectRoot];
  // First window: migrate from global multiRoots config if present
  if (windows.size === 0) {
    try {
      const saved = getConfigValue('multiRoots') ?? [];
      if (Array.isArray(saved) && saved.length > 0) return saved as string[];
    } catch {
      /* config not ready yet */
    }
  }
  return [];
}

function registerManagedWindow(win: BrowserWindow, projectRoot?: string): number {
  const winId = win.id;
  const roots = seedProjectRoots(projectRoot);
  windows.set(winId, {
    id: winId,
    win,
    projectRoot: roots[0] ?? null,
    projectRoots: roots,
  });
  windowCleanups.set(winId, registerIpcHandlers(win));
  return winId;
}

function loadWindowContent(win: BrowserWindow): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    win.loadURL(rendererUrl);
    return;
  }
  win.loadFile(path.join(outMainDir, '../renderer/index.html'));
}

function openDevToolsInDevelopment(win: BrowserWindow): void {
  if (process.env.NODE_ENV !== 'development') return;
  win.webContents.openDevTools({ mode: 'detach' });
}

function setupReadyToShow(win: BrowserWindow, state: WindowCreationState): void {
  win.once('ready-to-show', () => {
    markStartup('window-ready');
    if (state.isFirst && state.savedBounds?.isMaximized) win.maximize();
    win.show();
    openDevToolsInDevelopment(win);
  });
}

function clearBoundsTimer(winId: number): void {
  const timer = boundsTimers.get(winId);
  if (timer === undefined) return;
  clearTimeout(timer);
  boundsTimers.delete(winId);
}

function setupWindowBoundsHandlers(win: BrowserWindow, winId: number): void {
  const scheduleSaveBounds = createBoundsSaveHandler(win, winId, boundsTimers);
  win.on('resize', scheduleSaveBounds);
  win.on('move', scheduleSaveBounds);
  win.on('maximize', markWindowMaximized);
  win.on('unmaximize', () => {
    saveWindowBounds(win, false);
  });
}

function cleanupIpcHandlers(winId: number): void {
  const cleanup = windowCleanups.get(winId);
  if (!cleanup) return;
  cleanup();
  windowCleanups.delete(winId);
}

function setupWindowCloseHandler(win: BrowserWindow, winId: number): void {
  win.on('close', () => {
    clearBoundsTimer(winId);
    if (!win.isMaximized()) saveWindowBounds(win, false);
    persistWindowSessions();
    killPtySessionsForWindow(winId);
  });
  // Defer IPC handler cleanup to 'closed' — the renderer still makes IPC
  // calls (config:set, files:readDir, etc.) during beforeunload/unload which
  // run AFTER 'close' but BEFORE the window is destroyed.
  win.on('closed', () => {
    const managed = windows.get(winId);
    if (managed?.projectRoot) {
      void releaseContextLayer(managed.projectRoot);
      void releaseGraphController(managed.projectRoot);
    }
    cleanupIpcHandlers(winId);
    windows.delete(winId);
  });
}

function setupWindowLifecycle(win: BrowserWindow, winId: number, state: WindowCreationState): void {
  setupReadyToShow(win, state);
  setupWindowBoundsHandlers(win, winId);
  setupWindowCloseHandler(win, winId);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Creates a new BrowserWindow, registers IPC handlers for it,
 * and adds it to the managed windows map.
 */
export function createWindow(projectRoot?: string): BrowserWindow {
  ensureCSP();
  const state = getWindowCreationState();
  const preloadPath = path.join(outMainDir, '../preload/index.js');
  const win = createBrowserWindow(preloadPath, state);
  const winId = registerManagedWindow(win, projectRoot);
  loadWindowContent(win);
  setupWindowLifecycle(win, winId, state);
  return win;
}

export function getWindow(id: number): ManagedWindow | undefined {
  return windows.get(id);
}

export function getAllWindows(): ManagedWindow[] {
  return Array.from(windows.values());
}

export function getWindowInfos(): WindowInfo[] {
  return Array.from(windows.values()).map((mw) => ({
    id: mw.id,
    projectRoot: mw.projectRoot,
    projectRoots: mw.projectRoots,
  }));
}

export function setWindowProjectRoot(winId: number, projectRoot: string): void {
  const managed = windows.get(winId);
  const oldRoot = managed?.projectRoot ?? null;
  if (managed) {
    managed.projectRoot = projectRoot;
    managed.projectRoots = [projectRoot];
  }
  // Swap per-root services: release old root, acquire new
  if (oldRoot && oldRoot !== projectRoot) {
    void releaseContextLayer(oldRoot);
    void releaseGraphController(oldRoot);
  }
  void acquireContextLayer(projectRoot);
  void acquireGraphController(projectRoot);
  // Start context refresh for the new project root (timer may already be running for another root).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require avoids circular import during early startup
    const { startContextRefreshTimer } = require('./ipc-handlers/agentChat');
    startContextRefreshTimer([projectRoot]);
  } catch { /* agentChat module may not be loaded yet */ }
}

export function setWindowProjectRoots(winId: number, roots: string[]): void {
  const managed = windows.get(winId);
  const oldRoot = managed?.projectRoot ?? null;
  const newRoot = roots[0] ?? null;
  if (managed) {
    managed.projectRoots = roots;
    managed.projectRoot = newRoot;
  }
  // Swap per-root services if primary root changed
  if (oldRoot && oldRoot !== newRoot) {
    void releaseContextLayer(oldRoot);
    void releaseGraphController(oldRoot);
  }
  if (newRoot) {
    void acquireContextLayer(newRoot);
    void acquireGraphController(newRoot);
  }
}

export function getWindowProjectRoots(winId: number): string[] {
  return windows.get(winId)?.projectRoots ?? [];
}

export function closeWindow(id: number): void {
  const managed = windows.get(id);
  if (managed && !managed.win.isDestroyed()) managed.win.close();
}

/**
 * If a window already exists for the given project root, focus it.
 * Otherwise, create a new window.
 */
export function focusOrCreateWindow(projectRoot: string): BrowserWindow {
  for (const managed of windows.values()) {
    if (managed.projectRoot === projectRoot && !managed.win.isDestroyed()) {
      if (managed.win.isMinimized()) managed.win.restore();
      managed.win.focus();
      return managed.win;
    }
  }
  return createWindow(projectRoot);
}

export function focusWindow(id: number): void {
  const managed = windows.get(id);
  if (managed && !managed.win.isDestroyed()) {
    if (managed.win.isMinimized()) managed.win.restore();
    managed.win.focus();
  }
}

export function getWindowCount(): number {
  return windows.size;
}

/**
 * Get the first managed window (used for hooks server broadcast target).
 * Returns all non-destroyed windows for broadcasting.
 */
export function getAllActiveWindows(): BrowserWindow[] {
  const result: BrowserWindow[] = [];
  for (const managed of windows.values()) {
    if (!managed.win.isDestroyed()) result.push(managed.win);
  }
  return result;
}

// ─── Session persistence ────────────────────────────────────────────────────

function collectWindowSessions(): WindowSession[] {
  const sessions: WindowSession[] = [];
  for (const managed of windows.values()) {
    if (managed.win.isDestroyed()) continue;
    if (managed.projectRoots.length === 0) continue;
    const bounds = managed.win.getBounds();
    sessions.push({
      projectRoots: managed.projectRoots,
      bounds: { ...bounds, isMaximized: managed.win.isMaximized() },
    });
  }
  return sessions;
}

export function persistWindowSessions(): void {
  try {
    setConfigValue('windowSessions', collectWindowSessions());
  } catch {
    /* best-effort */
  }
}

function applySessionBounds(win: BrowserWindow, bounds: WindowSession['bounds']): void {
  if (!bounds) return;
  const validated = validateBounds(bounds);
  if (!validated) return;
  win.setBounds({
    x: validated.x,
    y: validated.y,
    width: validated.width,
    height: validated.height,
  });
  if (validated.isMaximized) win.maximize();
}

function restoreOneSession(session: WindowSession): BrowserWindow | null {
  if (!session.projectRoots?.length) return null;
  const win = createWindow(session.projectRoots[0]);
  const managed = windows.get(win.id);
  if (managed) {
    managed.projectRoots = session.projectRoots;
    managed.projectRoot = session.projectRoots[0] ?? null;
  }
  applySessionBounds(win, session.bounds);
  return win;
}

export function restoreWindowSessions(): BrowserWindow[] {
  const sessions = getConfigValue('windowSessions') ?? [];
  if (!Array.isArray(sessions) || sessions.length === 0) return [];
  return sessions.map(restoreOneSession).filter((w): w is BrowserWindow => w !== null);
}
