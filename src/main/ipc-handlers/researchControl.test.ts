/**
 * researchControl.test.ts — Unit tests for Wave 30 Phase G research mode
 * control IPC handlers.
 *
 * Mocks: ipcMain, logger, researchSessionState, config helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockRemoveHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
}));

vi.mock('../logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ─── Mock researchSessionState ────────────────────────────────────────────────

const mockGetResearchMode = vi.fn<(sessionId: string) => 'off' | 'conservative' | 'aggressive'>();
const mockSetResearchMode = vi.fn<(sessionId: string, mode: string) => void>();

vi.mock('../research/researchSessionState', () => ({
  getResearchMode: (id: string) => mockGetResearchMode(id),
  setResearchMode: (id: string, mode: string) => mockSetResearchMode(id, mode),
}));

// ─── Mock config helpers ──────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import {
  cleanupResearchControlHandlers,
  registerResearchControlHandlers,
} from './researchControl';

// ─── Test helpers ─────────────────────────────────────────────────────────────

type HandlerFn = (_event: unknown, args: unknown) => Promise<unknown>;

function captureHandlers(): Map<string, HandlerFn> {
  const map = new Map<string, HandlerFn>();
  mockHandle.mockImplementation((channel: string, fn: HandlerFn) => {
    map.set(channel, fn);
  });
  return map;
}

async function invoke(map: Map<string, HandlerFn>, channel: string, args: unknown): Promise<unknown> {
  const fn = map.get(channel);
  if (!fn) throw new Error(`No handler registered for "${channel}"`);
  return fn({} /* fake event */, args);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let handlers: Map<string, HandlerFn>;

beforeEach(() => {
  mockHandle.mockReset();
  mockRemoveHandler.mockReset();
  mockGetResearchMode.mockReset();
  mockSetResearchMode.mockReset();
  mockGetConfigValue.mockReset();
  mockSetConfigValue.mockReset();

  handlers = captureHandlers();
  registerResearchControlHandlers();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Channel registration ─────────────────────────────────────────────────────

describe('registerResearchControlHandlers — channel registration', () => {
  it('registers research:getSessionMode', () => {
    expect(handlers.has('research:getSessionMode')).toBe(true);
  });

  it('registers research:setSessionMode', () => {
    expect(handlers.has('research:setSessionMode')).toBe(true);
  });

  it('registers research:getGlobalDefault', () => {
    expect(handlers.has('research:getGlobalDefault')).toBe(true);
  });

  it('registers research:setGlobalDefault', () => {
    expect(handlers.has('research:setGlobalDefault')).toBe(true);
  });
});

// ─── research:getSessionMode ──────────────────────────────────────────────────

describe('research:getSessionMode', () => {
  it('returns mode from researchSessionState', async () => {
    mockGetResearchMode.mockReturnValue('aggressive');
    const res = await invoke(handlers, 'research:getSessionMode', { sessionId: 'sess-1' }) as {
      success: boolean; mode?: string;
    };
    expect(res.success).toBe(true);
    expect(res.mode).toBe('aggressive');
    expect(mockGetResearchMode).toHaveBeenCalledWith('sess-1');
  });

  it('returns conservative default via store when session is new', async () => {
    mockGetResearchMode.mockReturnValue('conservative');
    const res = await invoke(handlers, 'research:getSessionMode', { sessionId: 'new-sess' }) as {
      success: boolean; mode?: string;
    };
    expect(res.success).toBe(true);
    expect(res.mode).toBe('conservative');
  });

  it('fails when sessionId is missing', async () => {
    const res = await invoke(handlers, 'research:getSessionMode', {}) as {
      success: boolean; error?: string;
    };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sessionId/i);
  });

  it('fails when sessionId is empty string', async () => {
    const res = await invoke(handlers, 'research:getSessionMode', { sessionId: '   ' }) as {
      success: boolean; error?: string;
    };
    expect(res.success).toBe(false);
  });
});

// ─── research:setSessionMode ──────────────────────────────────────────────────

describe('research:setSessionMode', () => {
  it('calls setResearchMode with correct args for off', async () => {
    const res = await invoke(handlers, 'research:setSessionMode', {
      sessionId: 'sess-2', mode: 'off',
    }) as { success: boolean };
    expect(res.success).toBe(true);
    expect(mockSetResearchMode).toHaveBeenCalledWith('sess-2', 'off');
  });

  it('calls setResearchMode with correct args for aggressive', async () => {
    const res = await invoke(handlers, 'research:setSessionMode', {
      sessionId: 'sess-3', mode: 'aggressive',
    }) as { success: boolean };
    expect(res.success).toBe(true);
    expect(mockSetResearchMode).toHaveBeenCalledWith('sess-3', 'aggressive');
  });

  it('fails on invalid mode string', async () => {
    const res = await invoke(handlers, 'research:setSessionMode', {
      sessionId: 'sess-4', mode: 'turbo',
    }) as { success: boolean; error?: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/mode/i);
    expect(mockSetResearchMode).not.toHaveBeenCalled();
  });

  it('fails when sessionId is missing', async () => {
    const res = await invoke(handlers, 'research:setSessionMode', {
      mode: 'conservative',
    }) as { success: boolean; error?: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sessionId/i);
  });
});

// ─── research:getGlobalDefault ────────────────────────────────────────────────

describe('research:getGlobalDefault', () => {
  it('returns stored globalEnabled and defaultMode', async () => {
    mockGetConfigValue.mockReturnValue({ globalEnabled: true, defaultMode: 'aggressive' });
    const res = await invoke(handlers, 'research:getGlobalDefault', {}) as {
      success: boolean; globalEnabled?: boolean; defaultMode?: string;
    };
    expect(res.success).toBe(true);
    expect(res.globalEnabled).toBe(true);
    expect(res.defaultMode).toBe('aggressive');
  });

  it('returns defaults when config is undefined', async () => {
    mockGetConfigValue.mockReturnValue(undefined);
    const res = await invoke(handlers, 'research:getGlobalDefault', {}) as {
      success: boolean; globalEnabled?: boolean; defaultMode?: string;
    };
    expect(res.success).toBe(true);
    expect(res.globalEnabled).toBe(false);
    expect(res.defaultMode).toBe('conservative');
  });

  it('falls back to conservative for an unrecognised stored mode', async () => {
    mockGetConfigValue.mockReturnValue({ globalEnabled: false, defaultMode: 'unknown' });
    const res = await invoke(handlers, 'research:getGlobalDefault', {}) as {
      success: boolean; defaultMode?: string;
    };
    expect(res.success).toBe(true);
    expect(res.defaultMode).toBe('conservative');
  });
});

// ─── research:setGlobalDefault ────────────────────────────────────────────────

describe('research:setGlobalDefault', () => {
  it('persists globalEnabled and defaultMode via setConfigValue', async () => {
    const res = await invoke(handlers, 'research:setGlobalDefault', {
      globalEnabled: true, defaultMode: 'conservative',
    }) as { success: boolean };
    expect(res.success).toBe(true);
    expect(mockSetConfigValue).toHaveBeenCalledWith('researchSettings', {
      globalEnabled: true, defaultMode: 'conservative',
    });
  });

  it('fails when globalEnabled is not boolean', async () => {
    const res = await invoke(handlers, 'research:setGlobalDefault', {
      globalEnabled: 'yes', defaultMode: 'conservative',
    }) as { success: boolean; error?: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/globalEnabled/i);
    expect(mockSetConfigValue).not.toHaveBeenCalled();
  });

  it('fails on invalid defaultMode', async () => {
    const res = await invoke(handlers, 'research:setGlobalDefault', {
      globalEnabled: false, defaultMode: 'extreme',
    }) as { success: boolean; error?: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/defaultMode/i);
  });
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

describe('cleanupResearchControlHandlers', () => {
  it('removes all registered channels', () => {
    cleanupResearchControlHandlers();
    expect(mockRemoveHandler).toHaveBeenCalledWith('research:getSessionMode');
    expect(mockRemoveHandler).toHaveBeenCalledWith('research:setSessionMode');
    expect(mockRemoveHandler).toHaveBeenCalledWith('research:getGlobalDefault');
    expect(mockRemoveHandler).toHaveBeenCalledWith('research:setGlobalDefault');
  });
});
