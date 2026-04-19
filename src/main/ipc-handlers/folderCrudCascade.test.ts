/**
 * folderCrudCascade.test.ts — tests for folder delete cascade broadcast (Phase O).
 *
 * Verifies that deleting a folder with sessions causes a sessionCrud:changed
 * broadcast so the renderer sidebar re-renders with newly-orphaned sessions.
 */

/* eslint-disable security/detect-object-injection */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock electron ────────────────────────────────────────────────────────────

const sendCalls: Array<{ channel: string; payload: unknown }> = [];

const mockSend = vi.fn((channel: string, payload: unknown) => {
  sendCalls.push({ channel, payload });
});

const mockWin = { isDestroyed: () => false, webContents: { send: mockSend } };

const handleMap: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [mockWin] },
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

// ─── Mock sessionStore singleton ─────────────────────────────────────────────

vi.mock('../session/sessionStore', () => ({
  getSessionStore: () => ({ listAll: () => [] }),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdaptor(initial: SessionFolder[] = []) {
  let stored: SessionFolder[] = [...initial];
  return {
    read: () => stored,
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
  for (const k of Object.keys(handleMap)) delete handleMap[k];
  sendCalls.length = 0;
  mockSend.mockClear();
  cleanupFolderCrudHandlers();
  const adaptor = makeAdaptor();
  storeMock = openFolderStore(adaptor);
  registerFolderCrudHandlers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('folderCrud:delete cascade', () => {
  it('broadcasts sessionCrud:changed when deleted folder has sessions', async () => {
    storeMock?.upsert(makeFolder({ id: 'f1', sessionIds: ['s1', 's2'] }));

    const result = await call('folderCrud:delete', { id: 'f1' });
    expect(result.success).toBe(true);

    const sessionChangedCalls = sendCalls.filter((c) => c.channel === 'sessionCrud:changed');
    expect(sessionChangedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not broadcast sessionCrud:changed when deleted folder has no sessions', async () => {
    storeMock?.upsert(makeFolder({ id: 'f1', sessionIds: [] }));

    await call('folderCrud:delete', { id: 'f1' });

    const sessionChangedCalls = sendCalls.filter((c) => c.channel === 'sessionCrud:changed');
    expect(sessionChangedCalls.length).toBe(0);
  });

  it('still broadcasts folderCrud:changed on delete', async () => {
    storeMock?.upsert(makeFolder({ id: 'f1', sessionIds: ['s1'] }));

    await call('folderCrud:delete', { id: 'f1' });

    const folderChangedCalls = sendCalls.filter((c) => c.channel === 'folderCrud:changed');
    expect(folderChangedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('removes the folder from the store', async () => {
    storeMock?.upsert(makeFolder({ id: 'f1', sessionIds: ['s1'] }));
    expect(storeMock?.listAll()).toHaveLength(1);

    await call('folderCrud:delete', { id: 'f1' });

    expect(storeMock?.listAll()).toHaveLength(0);
  });
});
