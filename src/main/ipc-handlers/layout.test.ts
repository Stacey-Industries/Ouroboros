/**
 * layout.test.ts — Unit tests for the layout IPC handler registrar (Wave 28 Phase D).
 */

/* eslint-disable security/detect-object-injection */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

vi.mock('@shared/types/layout', () => ({}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (ch: string, fn: (...args: unknown[]) => unknown) => handlers.set(ch, fn),
      removeHandler: (ch: string) => handlers.delete(ch),
      _handlers: handlers,
      _invoke: async (ch: string, ...args: unknown[]) => {
        const fn = handlers.get(ch);
        if (!fn) throw new Error(`No handler for ${ch}`);
        return fn({} as Electron.IpcMainInvokeEvent, ...args);
      },
    },
  };
});

import { ipcMain } from 'electron';

import { cleanupLayoutHandlers, registerLayoutHandlers } from './layout';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (ipcMain as any)._invoke as (ch: string, ...args: unknown[]) => Promise<unknown>;

const SESSION_A = 'session-aaa';
const SESSION_B = 'session-bbb';
const TREE_A = { kind: 'leaf', slotName: 'editorContent', component: { componentKey: 'editorContent' } };
const TREE_B = { kind: 'leaf', slotName: 'terminalContent', component: { componentKey: 'terminalContent' } };

function makeLayout(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    presets: { v2: true },
    chatPrimary: true,
    dragAndDrop: true,
    customLayoutsPerSession: {},
    customLayoutsMru: [],
    globalCustomPresets: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfigValue.mockReturnValue(makeLayout());
  registerLayoutHandlers();
});

afterEach(() => {
  cleanupLayoutHandlers();
});

// ─── layout:getCustomLayout ───────────────────────────────────────────────────

describe('layout:getCustomLayout', () => {
  it('returns null tree when session has no saved layout', async () => {
    const result = await invoke('layout:getCustomLayout', SESSION_A);
    expect(result).toMatchObject({ success: true, tree: null });
  });

  it('returns saved tree when session has a layout', async () => {
    mockGetConfigValue.mockReturnValue(
      makeLayout({ customLayoutsPerSession: { [SESSION_A]: TREE_A } }),
    );
    const result = await invoke('layout:getCustomLayout', SESSION_A);
    expect(result).toMatchObject({ success: true, tree: TREE_A });
  });

  it('returns null tree for empty sessionId (no-op guard)', async () => {
    const result = await invoke('layout:getCustomLayout', '');
    expect(result).toMatchObject({ success: true, tree: null });
  });

  it('returns null tree when layout config is missing', async () => {
    mockGetConfigValue.mockReturnValue(undefined);
    const result = await invoke('layout:getCustomLayout', SESSION_A);
    expect(result).toMatchObject({ success: true, tree: null });
  });
});

// ─── layout:setCustomLayout ───────────────────────────────────────────────────

describe('layout:setCustomLayout', () => {
  it('persists tree to config and updates MRU', async () => {
    const result = await invoke('layout:setCustomLayout', SESSION_A, TREE_A);
    expect(result).toMatchObject({ success: true });
    expect(mockSetConfigValue).toHaveBeenCalledOnce();
    const [key, val] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe('layout');
    expect((val.customLayoutsPerSession as Record<string, unknown>)[SESSION_A]).toEqual(TREE_A);
    expect((val.customLayoutsMru as string[])).toContain(SESSION_A);
  });

  it('is a no-op for empty sessionId', async () => {
    const result = await invoke('layout:setCustomLayout', '', TREE_A);
    expect(result).toMatchObject({ success: true });
    expect(mockSetConfigValue).not.toHaveBeenCalled();
  });

  it('isolates multiple session IDs independently', async () => {
    mockGetConfigValue.mockReturnValue(makeLayout());
    await invoke('layout:setCustomLayout', SESSION_A, TREE_A);
    const firstCall = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    const afterFirst = firstCall[1] as Record<string, unknown>;

    mockGetConfigValue.mockReturnValue(afterFirst);
    await invoke('layout:setCustomLayout', SESSION_B, TREE_B);
    const secondCall = mockSetConfigValue.mock.calls[1] as [string, Record<string, unknown>];
    const final = secondCall[1] as Record<string, unknown>;
    const entries = final.customLayoutsPerSession as Record<string, unknown>;
    expect(entries[SESSION_A]).toEqual(TREE_A);
    expect(entries[SESSION_B]).toEqual(TREE_B);
  });

  it('prunes to 100 entries when cap is exceeded', async () => {
    const many: Record<string, unknown> = {};
    const mru: string[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `session-${i}`;
      many[id] = TREE_A;
      mru.push(id);
    }
    mockGetConfigValue.mockReturnValue(makeLayout({ customLayoutsPerSession: many, customLayoutsMru: mru }));
    await invoke('layout:setCustomLayout', SESSION_A, TREE_A);
    const [, val] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    const entries = val.customLayoutsPerSession as Record<string, unknown>;
    expect(Object.keys(entries).length).toBeLessThanOrEqual(100);
  });
});

// ─── layout:deleteCustomLayout ────────────────────────────────────────────────

describe('layout:deleteCustomLayout', () => {
  it('removes session entry from config', async () => {
    mockGetConfigValue.mockReturnValue(
      makeLayout({ customLayoutsPerSession: { [SESSION_A]: TREE_A }, customLayoutsMru: [SESSION_A] }),
    );
    const result = await invoke('layout:deleteCustomLayout', SESSION_A);
    expect(result).toMatchObject({ success: true });
    const [, val] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    const entries = val.customLayoutsPerSession as Record<string, unknown>;
    expect(entries[SESSION_A]).toBeUndefined();
    expect((val.customLayoutsMru as string[])).not.toContain(SESSION_A);
  });

  it('is a no-op for empty sessionId', async () => {
    await invoke('layout:deleteCustomLayout', '');
    expect(mockSetConfigValue).not.toHaveBeenCalled();
  });
});

// ─── layout:promoteToGlobal ───────────────────────────────────────────────────

describe('layout:promoteToGlobal', () => {
  it('appends a new global preset', async () => {
    const result = await invoke('layout:promoteToGlobal', 'My Preset', TREE_A);
    expect(result).toMatchObject({ success: true });
    const [, val] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    const presets = val.globalCustomPresets as Array<{ name: string }>;
    expect(presets[presets.length - 1].name).toBe('My Preset');
  });

  it('caps global presets at 20, dropping oldest', async () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({
      name: `preset-${i}`,
      tree: TREE_A,
      createdAt: i,
    }));
    mockGetConfigValue.mockReturnValue(makeLayout({ globalCustomPresets: existing }));
    await invoke('layout:promoteToGlobal', 'New One', TREE_B);
    const [, val] = mockSetConfigValue.mock.calls[0] as [string, Record<string, unknown>];
    const presets = val.globalCustomPresets as Array<{ name: string }>;
    expect(presets.length).toBe(20);
    expect(presets[presets.length - 1].name).toBe('New One');
    expect(presets[0].name).toBe('preset-1');
  });

  it('fails when name is empty', async () => {
    const result = await invoke('layout:promoteToGlobal', '', TREE_A);
    expect(result).toMatchObject({ success: false });
  });

  it('fails when tree is not an object', async () => {
    const result = await invoke('layout:promoteToGlobal', 'Good Name', 'bad-value');
    expect(result).toMatchObject({ success: false });
  });
});

// ─── cleanupLayoutHandlers ────────────────────────────────────────────────────

describe('cleanupLayoutHandlers', () => {
  it('removes handlers so subsequent invocations fail', async () => {
    cleanupLayoutHandlers();
    await expect(invoke('layout:getCustomLayout', SESSION_A)).rejects.toThrow();
  });
});
