/**
 * windowManager.test.ts — Unit tests for multi-window lifecycle management.
 *
 * The `windows` Map is module-level state, so each describe block uses
 * vi.resetModules() + dynamic import to get a fresh module copy with empty
 * state. Mocks are defined as hoisted stubs so the electron vi.mock() factory
 * can reference them safely.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted shared mock state ─────────────────────────────────────────────────
// Any variable referenced inside a vi.mock() factory must be created with
// vi.hoisted() so the factory can close over it before module evaluation.

const mocks = vi.hoisted(() => {
  const loadURL = vi.fn().mockResolvedValue(undefined);
  const loadFile = vi.fn().mockResolvedValue(undefined);
  const show = vi.fn();
  const close = vi.fn();
  const focus = vi.fn();
  const isDestroyed = vi.fn(() => false);
  const isMinimized = vi.fn(() => false);
  const isMaximized = vi.fn(() => false);
  const restore = vi.fn();
  const getBounds = vi.fn(() => ({ x: 100, y: 100, width: 1280, height: 800 }));
  const setBounds = vi.fn();
  const maximize = vi.fn();
  const winOn = vi.fn();
  const winOnce = vi.fn();
  const webContentsSend = vi.fn();
  const webContentsOn = vi.fn();
  const openDevTools = vi.fn();
  const getAllDisplays = vi.fn(() => [
    { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
  ]);
  const onHeadersReceived = vi.fn();
  const getConfigValue: ReturnType<typeof vi.fn> = vi.fn(() => undefined);
  const setConfigValue = vi.fn();
  const killPtySessionsForWindow = vi.fn();
  const acquireGraphController = vi.fn().mockResolvedValue(undefined);
  const releaseGraphController = vi.fn().mockResolvedValue(undefined);
  const acquireContextLayer = vi.fn().mockResolvedValue(undefined);
  const releaseContextLayer = vi.fn().mockResolvedValue(undefined);
  const registerIpcHandlers = vi.fn(() => vi.fn());

  // Incrementing ID counter shared across all BrowserWindow instantiations
  let nextId = 1;

  return {
    loadURL, loadFile, show, close, focus, isDestroyed, isMinimized, isMaximized,
    restore, getBounds, setBounds, maximize, winOn, winOnce,
    webContentsSend, webContentsOn, openDevTools, getAllDisplays, onHeadersReceived,
    getConfigValue, setConfigValue, killPtySessionsForWindow,
    acquireGraphController, releaseGraphController,
    acquireContextLayer, releaseContextLayer,
    registerIpcHandlers,
    get nextId() { return nextId; },
    bumpId() { return nextId++; },
    resetId() { nextId = 1; },
  };
});

// ── Static module mocks ───────────────────────────────────────────────────────

vi.mock('electron', () => {
  class MockBrowserWindow {
    loadURL = mocks.loadURL;
    loadFile = mocks.loadFile;
    show = mocks.show;
    close = mocks.close;
    focus = mocks.focus;
    isDestroyed = mocks.isDestroyed;
    isMinimized = mocks.isMinimized;
    isMaximized = mocks.isMaximized;
    restore = mocks.restore;
    getBounds = mocks.getBounds;
    setBounds = mocks.setBounds;
    maximize = mocks.maximize;
    on = mocks.winOn;
    once = mocks.winOnce;
    webContents = {
      send: mocks.webContentsSend,
      on: mocks.webContentsOn,
      openDevTools: mocks.openDevTools,
    };
    id: number;
    constructor() {
      this.id = mocks.bumpId();
    }
  }
  return {
    BrowserWindow: MockBrowserWindow,
    screen: { getAllDisplays: mocks.getAllDisplays },
    session: {
      defaultSession: {
        webRequest: { onHeadersReceived: mocks.onHeadersReceived },
      },
    },
  };
});

vi.mock('./config', () => ({
  getConfigValue: mocks.getConfigValue,
  setConfigValue: mocks.setConfigValue,
}));

vi.mock('./pty', () => ({
  killPtySessionsForWindow: mocks.killPtySessionsForWindow,
}));

vi.mock('./codebaseGraph/graphController', () => ({
  acquireGraphController: mocks.acquireGraphController,
  releaseGraphController: mocks.releaseGraphController,
}));

vi.mock('./contextLayer/contextLayerController', () => ({
  acquireContextLayer: mocks.acquireContextLayer,
  releaseContextLayer: mocks.releaseContextLayer,
}));

vi.mock('./ipc', () => ({
  registerIpcHandlers: mocks.registerIpcHandlers,
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./fdPressureDiagnostics', () => ({
  describeFdPressure: vi.fn(() => 'active handles=0'),
}));

// agentChat is dynamically required inside setWindowProjectRoot — stub it out.
vi.mock('./ipc-handlers/agentChat', () => ({
  startContextRefreshTimer: vi.fn(),
}));

// ── Type alias ────────────────────────────────────────────────────────────────

type WMModule = typeof import('./windowManager');

// ── Test helpers ──────────────────────────────────────────────────────────────

async function freshWM(): Promise<WMModule> {
  return import('./windowManager');
}

function resetMocks() {
  vi.clearAllMocks();
  mocks.resetId();
  mocks.isDestroyed.mockReturnValue(false);
  mocks.isMinimized.mockReturnValue(false);
  mocks.isMaximized.mockReturnValue(false);
  mocks.getBounds.mockReturnValue({ x: 100, y: 100, width: 1280, height: 800 });
  mocks.getConfigValue.mockReturnValue(undefined);
  mocks.getAllDisplays.mockReturnValue([
    { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
  ]);
  mocks.registerIpcHandlers.mockReturnValue(vi.fn());
}

// ── createWindow ──────────────────────────────────────────────────────────────

describe('createWindow', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns a BrowserWindow instance', () => {
    const win = wm.createWindow();
    expect(win).toBeDefined();
    expect(typeof win.id).toBe('number');
  });

  it('increments window count after creation', () => {
    expect(wm.getWindowCount()).toBe(0);
    wm.createWindow();
    expect(wm.getWindowCount()).toBe(1);
    wm.createWindow();
    expect(wm.getWindowCount()).toBe(2);
  });

  it('registers the window in the managed map', () => {
    const win = wm.createWindow();
    expect(wm.getAllWindows()).toHaveLength(1);
    expect(wm.getAllWindows()[0].win).toBe(win);
  });

  it('seeds projectRoots from explicit root argument', () => {
    wm.createWindow('/my/project');
    const managed = wm.getAllWindows()[0];
    expect(managed.projectRoot).toBe('/my/project');
    expect(managed.projectRoots).toEqual(['/my/project']);
  });

  it('migrates from multiRoots config for the first window with no root', () => {
    mocks.getConfigValue.mockImplementation((key: string) => {
      if (key === 'multiRoots') return ['/migrated/root'];
      return undefined;
    });
    wm.createWindow();
    const managed = wm.getAllWindows()[0];
    expect(managed.projectRoot).toBe('/migrated/root');
    expect(managed.projectRoots).toEqual(['/migrated/root']);
  });

  it('does not migrate multiRoots for second window', () => {
    mocks.getConfigValue.mockImplementation((key: string) => {
      if (key === 'multiRoots') return ['/migrated/root'];
      return undefined;
    });
    wm.createWindow('/explicit/first');
    wm.createWindow();
    const managed = wm.getAllWindows()[1];
    expect(managed.projectRoot).toBeNull();
    expect(managed.projectRoots).toEqual([]);
  });

  it('registers IPC handlers for the new window', () => {
    wm.createWindow();
    expect(mocks.registerIpcHandlers).toHaveBeenCalledTimes(1);
  });
});

// ── getWindow / getAllWindows / getWindowInfos ─────────────────────────────────

describe('getWindow / getAllWindows / getWindowInfos', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('getWindow returns undefined for unknown id', () => {
    expect(wm.getWindow(9999)).toBeUndefined();
  });

  it('getWindow returns ManagedWindow for a created window', () => {
    const win = wm.createWindow('/root/a');
    const managed = wm.getWindow(win.id);
    expect(managed).toBeDefined();
    expect(managed?.win).toBe(win);
    expect(managed?.projectRoot).toBe('/root/a');
  });

  it('getAllWindows returns all registered windows', () => {
    wm.createWindow('/root/a');
    wm.createWindow('/root/b');
    expect(wm.getAllWindows()).toHaveLength(2);
  });

  it('getWindowInfos returns WindowInfo array with correct shape', () => {
    wm.createWindow('/root/x');
    const infos = wm.getWindowInfos();
    expect(infos).toHaveLength(1);
    expect(infos[0]).toHaveProperty('id');
    expect(infos[0].projectRoot).toBe('/root/x');
    expect(infos[0].projectRoots).toEqual(['/root/x']);
  });
});

// ── getWindowProjectRoots ─────────────────────────────────────────────────────

describe('getWindowProjectRoots', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns empty array for unknown window id', () => {
    expect(wm.getWindowProjectRoots(9999)).toEqual([]);
  });

  it('returns the roots for a known window', () => {
    const win = wm.createWindow('/proj/abc');
    expect(wm.getWindowProjectRoots(win.id)).toEqual(['/proj/abc']);
  });
});

// ── setWindowProjectRoot ──────────────────────────────────────────────────────

describe('setWindowProjectRoot', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('updates projectRoot and projectRoots[0]', () => {
    const win = wm.createWindow('/old/root');
    wm.setWindowProjectRoot(win.id, '/new/root');
    const managed = wm.getWindow(win.id);
    expect(managed?.projectRoot).toBe('/new/root');
    expect(managed?.projectRoots[0]).toBe('/new/root');
  });

  it('releases the old context layer when root changes', () => {
    const win = wm.createWindow('/old/root');
    vi.clearAllMocks();
    wm.setWindowProjectRoot(win.id, '/new/root');
    expect(mocks.releaseContextLayer).toHaveBeenCalledWith('/old/root');
  });

  it('acquires context layer and graph controller for new root', () => {
    const win = wm.createWindow('/old/root');
    vi.clearAllMocks();
    wm.setWindowProjectRoot(win.id, '/new/root');
    expect(mocks.acquireContextLayer).toHaveBeenCalledWith('/new/root');
    expect(mocks.acquireGraphController).toHaveBeenCalledWith('/new/root');
  });

  it('does not release old root if it matches new root', () => {
    const win = wm.createWindow('/same/root');
    vi.clearAllMocks();
    wm.setWindowProjectRoot(win.id, '/same/root');
    expect(mocks.releaseContextLayer).not.toHaveBeenCalled();
    expect(mocks.releaseGraphController).not.toHaveBeenCalled();
  });
});

// ── setWindowProjectRoots ─────────────────────────────────────────────────────

describe('setWindowProjectRoots', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('updates projectRoots array', () => {
    const win = wm.createWindow('/root/a');
    wm.setWindowProjectRoots(win.id, ['/root/a', '/root/b']);
    const managed = wm.getWindow(win.id);
    expect(managed?.projectRoots).toEqual(['/root/a', '/root/b']);
  });

  it('updates projectRoot to first element', () => {
    const win = wm.createWindow('/root/a');
    wm.setWindowProjectRoots(win.id, ['/root/new', '/root/b']);
    const managed = wm.getWindow(win.id);
    expect(managed?.projectRoot).toBe('/root/new');
  });

  it('sets projectRoot to null when roots is empty', () => {
    const win = wm.createWindow('/root/a');
    wm.setWindowProjectRoots(win.id, []);
    const managed = wm.getWindow(win.id);
    expect(managed?.projectRoot).toBeNull();
    expect(managed?.projectRoots).toEqual([]);
  });
});

// ── focusOrCreateWindow ───────────────────────────────────────────────────────

describe('focusOrCreateWindow', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('focuses an existing non-destroyed window with matching root', () => {
    const win = wm.createWindow('/proj/same');
    vi.clearAllMocks();
    mocks.isDestroyed.mockReturnValue(false);
    mocks.isMinimized.mockReturnValue(false);
    const result = wm.focusOrCreateWindow('/proj/same');
    expect(result).toBe(win);
    expect(mocks.focus).toHaveBeenCalled();
  });

  it('creates a new window when no match exists', () => {
    wm.createWindow('/proj/other');
    const initialCount = wm.getWindowCount();
    wm.focusOrCreateWindow('/proj/new');
    expect(wm.getWindowCount()).toBe(initialCount + 1);
  });

  it('restores a minimized window before focusing', () => {
    const win = wm.createWindow('/proj/mini');
    vi.clearAllMocks();
    mocks.isDestroyed.mockReturnValue(false);
    mocks.isMinimized.mockReturnValue(true);
    const result = wm.focusOrCreateWindow('/proj/mini');
    expect(result).toBe(win);
    expect(mocks.restore).toHaveBeenCalled();
    expect(mocks.focus).toHaveBeenCalled();
  });

  it('skips destroyed windows and creates a new one', () => {
    wm.createWindow('/proj/gone');
    mocks.isDestroyed.mockReturnValue(true);
    const initialCount = wm.getWindowCount();
    wm.focusOrCreateWindow('/proj/gone');
    expect(wm.getWindowCount()).toBe(initialCount + 1);
  });
});

// ── focusWindow ───────────────────────────────────────────────────────────────

describe('focusWindow', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('focuses a live window', () => {
    const win = wm.createWindow();
    vi.clearAllMocks();
    mocks.isDestroyed.mockReturnValue(false);
    mocks.isMinimized.mockReturnValue(false);
    wm.focusWindow(win.id);
    expect(mocks.focus).toHaveBeenCalled();
  });

  it('restores minimized window before focusing', () => {
    const win = wm.createWindow();
    vi.clearAllMocks();
    mocks.isDestroyed.mockReturnValue(false);
    mocks.isMinimized.mockReturnValue(true);
    wm.focusWindow(win.id);
    expect(mocks.restore).toHaveBeenCalled();
    expect(mocks.focus).toHaveBeenCalled();
  });

  it('no-ops for unknown window id', () => {
    wm.focusWindow(9999);
    expect(mocks.focus).not.toHaveBeenCalled();
  });
});

// ── closeWindow ───────────────────────────────────────────────────────────────

describe('closeWindow', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('calls win.close() for a live window', () => {
    const win = wm.createWindow();
    vi.clearAllMocks();
    mocks.isDestroyed.mockReturnValue(false);
    wm.closeWindow(win.id);
    expect(mocks.close).toHaveBeenCalled();
  });

  it('no-ops when the window is destroyed', () => {
    const win = wm.createWindow();
    vi.clearAllMocks();
    mocks.isDestroyed.mockReturnValue(true);
    wm.closeWindow(win.id);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('no-ops for unknown id', () => {
    wm.closeWindow(9999);
    expect(mocks.close).not.toHaveBeenCalled();
  });
});

// ── getAllActiveWindows ────────────────────────────────────────────────────────

describe('getAllActiveWindows', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns empty array when no windows exist', () => {
    expect(wm.getAllActiveWindows()).toEqual([]);
  });

  it('includes non-destroyed windows', () => {
    wm.createWindow();
    wm.createWindow();
    mocks.isDestroyed.mockReturnValue(false);
    expect(wm.getAllActiveWindows()).toHaveLength(2);
  });

  it('excludes destroyed windows', () => {
    wm.createWindow();
    mocks.isDestroyed.mockReturnValue(true);
    expect(wm.getAllActiveWindows()).toHaveLength(0);
  });
});

// ── persistWindowSessions ─────────────────────────────────────────────────────

describe('persistWindowSessions', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('writes empty array when no windows are registered', () => {
    wm.persistWindowSessions();
    expect(mocks.setConfigValue).toHaveBeenCalledWith('windowSessions', []);
  });

  it('skips destroyed windows', () => {
    wm.createWindow('/proj/a');
    mocks.isDestroyed.mockReturnValue(true);
    wm.persistWindowSessions();
    expect(mocks.setConfigValue).toHaveBeenCalledWith('windowSessions', []);
  });

  it('skips windows with no project roots', () => {
    wm.createWindow();
    mocks.isDestroyed.mockReturnValue(false);
    wm.persistWindowSessions();
    expect(mocks.setConfigValue).toHaveBeenCalledWith('windowSessions', []);
  });

  it('serializes bounds and isMaximized for valid windows', () => {
    wm.createWindow('/proj/real');
    mocks.isDestroyed.mockReturnValue(false);
    mocks.isMaximized.mockReturnValue(true);
    mocks.getBounds.mockReturnValue({ x: 50, y: 60, width: 1440, height: 900 });
    wm.persistWindowSessions();
    const sessionCall = mocks.setConfigValue.mock.calls.find((c) => c[0] === 'windowSessions');
    expect(sessionCall).toBeDefined();
    type Session = {
      projectRoots: string[];
      bounds: { x: number; y: number; width: number; height: number; isMaximized: boolean };
    };
    const sessions = sessionCall![1] as Session[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].projectRoots).toEqual(['/proj/real']);
    expect(sessions[0].bounds.isMaximized).toBe(true);
    expect(sessions[0].bounds.width).toBe(1440);
  });
});

// ── restoreWindowSessions ─────────────────────────────────────────────────────

describe('restoreWindowSessions', () => {
  let wm: WMModule;

  beforeEach(async () => {
    vi.resetModules();
    resetMocks();
    wm = await freshWM();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns empty array when config has no sessions', () => {
    mocks.getConfigValue.mockReturnValue(undefined);
    expect(wm.restoreWindowSessions()).toEqual([]);
  });

  it('returns empty array when sessions config is empty array', () => {
    mocks.getConfigValue.mockReturnValue([]);
    expect(wm.restoreWindowSessions()).toEqual([]);
  });

  it('creates windows for each saved session with roots', () => {
    mocks.getConfigValue.mockImplementation((key: string) => {
      if (key === 'windowSessions') {
        return [
          { projectRoots: ['/proj/a'], bounds: undefined },
          { projectRoots: ['/proj/b'], bounds: undefined },
        ];
      }
      return undefined;
    });
    const windows = wm.restoreWindowSessions();
    expect(windows).toHaveLength(2);
    expect(wm.getWindowCount()).toBe(2);
  });

  it('sets projectRoots on restored windows', () => {
    mocks.getConfigValue.mockImplementation((key: string) => {
      if (key === 'windowSessions') {
        return [{ projectRoots: ['/proj/restored', '/proj/extra'], bounds: undefined }];
      }
      return undefined;
    });
    wm.restoreWindowSessions();
    const managed = wm.getAllWindows()[0];
    expect(managed.projectRoots).toEqual(['/proj/restored', '/proj/extra']);
    expect(managed.projectRoot).toBe('/proj/restored');
  });

  it('skips sessions with empty projectRoots', () => {
    mocks.getConfigValue.mockImplementation((key: string) => {
      if (key === 'windowSessions') {
        return [
          { projectRoots: [], bounds: undefined },
          { projectRoots: ['/proj/valid'], bounds: undefined },
        ];
      }
      return undefined;
    });
    const windows = wm.restoreWindowSessions();
    expect(windows).toHaveLength(1);
  });

  it('applies validated bounds when session has valid bounds', () => {
    mocks.getAllDisplays.mockReturnValue([
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    ]);
    mocks.getConfigValue.mockImplementation((key: string) => {
      if (key === 'windowSessions') {
        return [{
          projectRoots: ['/proj/bounded'],
          bounds: { x: 100, y: 100, width: 1280, height: 800, isMaximized: false },
        }];
      }
      return undefined;
    });
    wm.restoreWindowSessions();
    expect(mocks.setBounds).toHaveBeenCalled();
  });
});
