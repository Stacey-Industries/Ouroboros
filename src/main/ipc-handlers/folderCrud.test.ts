/**
 * folderCrud.test.ts — unit tests for the folderCrud IPC handler layer.
 *
 * Strategy: exercise handlers by calling registerFolderCrudHandlers() with a
 * mocked ipcMain.handle — captures the registered handler functions directly,
 * then invokes them with synthetic args. No Electron bootstrap required.
 */

/* eslint-disable security/detect-object-injection */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock electron ────────────────────────────────────────────────────────────

const handleMap: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handleMap[channel] = fn;
    }),
    removeHandler: vi.fn(),
  },
}));

// ─── Mock folderStore singleton ───────────────────────────────────────────────

import type { FolderStore, SessionFolder } from '../session/folderStore';
import { openFolderStore } from '../session/folderStore';

let storeMock: FolderStore | null = null;

vi.mock('../session/folderStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session/folderStore')>();
  return { ...actual, getFolderStore: () => storeMock };
});

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdaptor(initial: SessionFolder[] = []) {
  let stored: SessionFolder[] = [...initial];
  return {
    get data(): SessionFolder[] { return stored; },
    read: () => stored,
    // write receives a potentially-aliased array; snapshot it first
    write: (folders: SessionFolder[]) => { stored = [...folders]; },
  };
}

function makeFolder(overrides: Partial<SessionFolder> = {}): SessionFolder {
  return { id: 'f1', name: 'Test', sessionIds: [], createdAt: 1000, order: 0, ...overrides };
}

async function call(channel: string, args?: unknown): Promise<Record<string, unknown>> {
  const handler = handleMap[channel];
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return (await Promise.resolve(handler(null, args))) as Record<string, unknown>;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

import { cleanupFolderCrudHandlers, registerFolderCrudHandlers } from './folderCrud';

beforeEach(() => {
  // Clear handler map and re-register so each test gets fresh captures.
  for (const k of Object.keys(handleMap)) delete handleMap[k];
  cleanupFolderCrudHandlers();
  const adaptor = makeAdaptor();
  storeMock = openFolderStore(adaptor);
  registerFolderCrudHandlers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('folderCrud IPC handlers', () => {
  it('folderCrud:list returns empty array initially', async () => {
    const result = await call('folderCrud:list');
    expect(result.success).toBe(true);
    expect(result.folders).toEqual([]);
  });

  it('folderCrud:create inserts a folder and returns it', async () => {
    const result = await call('folderCrud:create', { name: 'Alpha' });
    expect(result.success).toBe(true);
    const folder = result.folder as SessionFolder;
    expect(folder?.name).toBe('Alpha');
    expect(storeMock?.listAll()).toHaveLength(1);
  });

  it('folderCrud:create fails when name is missing', async () => {
    const result = await call('folderCrud:create', {});
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/name/i);
  });

  it('folderCrud:rename updates folder name', async () => {
    storeMock?.upsert(makeFolder({ id: 'f1', name: 'Old' }));
    const result = await call('folderCrud:rename', { id: 'f1', name: 'New' });
    expect(result.success).toBe(true);
    expect(storeMock?.listAll()[0]?.name).toBe('New');
  });

  it('folderCrud:rename fails for unknown id', async () => {
    const result = await call('folderCrud:rename', { id: 'nope', name: 'X' });
    expect(result.success).toBe(false);
  });

  it('folderCrud:delete removes a folder', async () => {
    storeMock?.upsert(makeFolder());
    const result = await call('folderCrud:delete', { id: 'f1' });
    expect(result.success).toBe(true);
    expect(storeMock?.listAll()).toHaveLength(0);
  });

  it('folderCrud:addSession adds sessionId to folder', async () => {
    storeMock?.upsert(makeFolder());
    const result = await call('folderCrud:addSession', { folderId: 'f1', sessionId: 's1' });
    expect(result.success).toBe(true);
    expect(storeMock?.listAll()[0]?.sessionIds).toContain('s1');
  });

  it('folderCrud:removeSession removes sessionId from folder', async () => {
    storeMock?.upsert(makeFolder({ sessionIds: ['s1'] }));
    const result = await call('folderCrud:removeSession', { folderId: 'f1', sessionId: 's1' });
    expect(result.success).toBe(true);
    expect(storeMock?.listAll()[0]?.sessionIds).toHaveLength(0);
  });

  it('folderCrud:moveSession moves session between folders', async () => {
    storeMock?.upsert(makeFolder({ id: 'fa', sessionIds: ['s1'] }));
    storeMock?.upsert(makeFolder({ id: 'fb', sessionIds: [] }));
    const result = await call('folderCrud:moveSession', { fromId: 'fa', toId: 'fb', sessionId: 's1' });
    expect(result.success).toBe(true);
    const all = storeMock?.listAll() ?? [];
    expect(all.find((f) => f.id === 'fa')?.sessionIds).not.toContain('s1');
    expect(all.find((f) => f.id === 'fb')?.sessionIds).toContain('s1');
  });

  it('folderCrud:list falls back to empty when store is null', async () => {
    storeMock = null;
    const result = await call('folderCrud:list');
    expect(result.success).toBe(true);
    expect(result.folders).toEqual([]);
  });
});
