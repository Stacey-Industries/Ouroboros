/**
 * workspaceReadList.test.ts — Unit tests for the workspaceReadList IPC handler registrar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockGetReadList = vi.fn((root: string): string[] => { void root; return []; });
const mockAddToReadList = vi.fn((root: string, file: string): string[] => { void root; void file; return []; });
const mockRemoveFromReadList = vi.fn((root: string, file: string): string[] => { void root; void file; return []; });

vi.mock('../orchestration/workspaceReadList', () => ({
  getReadList: (r: string) => mockGetReadList(r),
  addToReadList: (r: string, f: string) => mockAddToReadList(r, f),
  removeFromReadList: (r: string, f: string) => mockRemoveFromReadList(r, f),
}));

const sentMessages: Array<{ channel: string; payload: unknown }> = [];
const mockWebContents = { send: (ch: string, p: unknown) => sentMessages.push({ channel: ch, payload: p }) };
const mockWin = { isDestroyed: () => false, webContents: mockWebContents };

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
    BrowserWindow: { getAllWindows: () => [mockWin] },
  };
});

vi.mock('../logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { ipcMain } from 'electron';

import {
  cleanupWorkspaceReadListHandlers,
  registerWorkspaceReadListHandlers,
} from './workspaceReadList';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (ipcMain as any)._invoke as (ch: string, ...args: unknown[]) => Promise<unknown>;

// ─── Tests ────────────────────────────────────────────────────────────────────

const ROOT = '/projects/my-app';
const FILE = '/projects/my-app/src/main.ts';

beforeEach(() => {
  sentMessages.length = 0;
  vi.clearAllMocks();
  registerWorkspaceReadListHandlers();
});

afterEach(() => {
  cleanupWorkspaceReadListHandlers();
});

describe('workspaceReadList:get', () => {
  it('returns success with files from getReadList', async () => {
    mockGetReadList.mockReturnValueOnce([FILE]);
    const result = await invoke('workspaceReadList:get', { projectRoot: ROOT });
    expect(result).toMatchObject({ success: true, files: [FILE] });
    expect(mockGetReadList).toHaveBeenCalledWith(ROOT);
  });

  it('fails when projectRoot is missing', async () => {
    const result = await invoke('workspaceReadList:get', {});
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('projectRoot') });
  });
});

describe('workspaceReadList:add', () => {
  it('returns success with updated files and broadcasts', async () => {
    mockAddToReadList.mockReturnValueOnce([FILE]);
    const result = await invoke('workspaceReadList:add', { projectRoot: ROOT, filePath: FILE });
    expect(result).toMatchObject({ success: true, files: [FILE] });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      channel: 'workspaceReadList:changed',
      payload: { projectRoot: ROOT, files: [FILE] },
    });
  });

  it('fails when filePath is missing', async () => {
    const result = await invoke('workspaceReadList:add', { projectRoot: ROOT });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('filePath') });
  });
});

describe('workspaceReadList:remove', () => {
  it('returns success with updated files and broadcasts', async () => {
    mockRemoveFromReadList.mockReturnValueOnce([]);
    const result = await invoke('workspaceReadList:remove', { projectRoot: ROOT, filePath: FILE });
    expect(result).toMatchObject({ success: true, files: [] });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].channel).toBe('workspaceReadList:changed');
  });

  it('fails when projectRoot is missing', async () => {
    const result = await invoke('workspaceReadList:remove', { filePath: FILE });
    expect(result).toMatchObject({ success: false });
  });
});

describe('cleanupWorkspaceReadListHandlers', () => {
  it('removes handlers so subsequent invocations fail', async () => {
    cleanupWorkspaceReadListHandlers();
    await expect(invoke('workspaceReadList:get', { projectRoot: ROOT })).rejects.toThrow();
  });
});
