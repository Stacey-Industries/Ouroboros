/**
 * ipc-handlers/ptyPersistence.test.ts — Smoke tests for PTY persistence handlers.
 *
 * Verifies that each handler is registered under the correct channel name
 * and dispatches correctly to the mocked store / spawnPty.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler);
    }),
  },
  BrowserWindow: {},
}));

const mockSpawnPty = vi.fn();
vi.mock('../pty', () => ({
  spawnPty: (...args: unknown[]) => mockSpawnPty(...args),
}));

import type { PersistedPtySession, PtyPersistence } from '../ptyPersistence';
import { registerPtyPersistenceHandlers } from './ptyPersistence';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSession(overrides: Partial<PersistedPtySession> = {}): PersistedPtySession {
  return {
    id: 'sess-1',
    cwd: '/home/user/project',
    shellPath: '/bin/bash',
    shellArgs: ['--login'],
    cols: 80,
    rows: 24,
    windowId: 1,
    envHash: 'abc123',
    createdAt: 1_000_000,
    lastSeenAt: 1_000_001,
    ...overrides,
  };
}

function makeStore(overrides: Partial<PtyPersistence> = {}): PtyPersistence {
  return {
    isEnabled: vi.fn(() => true),
    saveSession: vi.fn(),
    updateSession: vi.fn(),
    removeSession: vi.fn(),
    listSessions: vi.fn(() => [makeSession()]),
    clearAll: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

function fakeEvent(): unknown {
  return { sender: {} };
}

function makeSenderWindow(win = {}) {
  return vi.fn(() => win as import('electron').BrowserWindow);
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  registeredHandlers.clear();
  mockSpawnPty.mockReset();
});

describe('registerPtyPersistenceHandlers', () => {
  it('registers all three channels and returns their names', () => {
    const store = makeStore();
    const channels = registerPtyPersistenceHandlers(makeSenderWindow(), store);
    expect(channels).toContain('pty:listPersistedSessions');
    expect(channels).toContain('pty:restoreSession');
    expect(channels).toContain('pty:discardPersistedSessions');
    expect(channels).toHaveLength(3);
  });
});

describe('pty:listPersistedSessions', () => {
  it('returns sessions from the store when enabled', async () => {
    const session = makeSession();
    const store = makeStore({ listSessions: vi.fn(() => [session]) });
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:listPersistedSessions')!;
    const result = await handler(fakeEvent());
    expect(result).toEqual([session]);
  });

  it('returns empty array when store is disabled', async () => {
    const store = makeStore({ isEnabled: vi.fn(() => false) });
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:listPersistedSessions')!;
    const result = await handler(fakeEvent());
    expect(result).toEqual([]);
    expect(store.listSessions).not.toHaveBeenCalled();
  });
});

describe('pty:restoreSession', () => {
  it('returns error when store is disabled', async () => {
    const store = makeStore({ isEnabled: vi.fn(() => false) });
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:restoreSession')!;
    const result = await handler(fakeEvent(), 'sess-1');
    expect(result).toMatchObject({ success: false });
  });

  it('returns error when session id is not found', async () => {
    const store = makeStore({ listSessions: vi.fn(() => []) });
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:restoreSession')!;
    const result = await handler(fakeEvent(), 'missing-id');
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('missing-id') });
    expect(mockSpawnPty).not.toHaveBeenCalled();
  });

  it('calls spawnPty with cwd/cols/rows from persisted session', async () => {
    const session = makeSession({ cwd: '/repo', cols: 100, rows: 30 });
    const store = makeStore({ listSessions: vi.fn(() => [session]) });
    mockSpawnPty.mockResolvedValue({ success: true });
    const win = {};
    registerPtyPersistenceHandlers(makeSenderWindow(win), store);
    const handler = registeredHandlers.get('pty:restoreSession')!;
    const result = await handler(fakeEvent(), 'sess-1');
    expect(mockSpawnPty).toHaveBeenCalledWith('sess-1', win, {
      cwd: '/repo',
      cols: 100,
      rows: 30,
    });
    expect(result).toMatchObject({ success: true });
  });

  it('touches lastSeenAt on successful restore', async () => {
    const session = makeSession();
    const store = makeStore({ listSessions: vi.fn(() => [session]) });
    mockSpawnPty.mockResolvedValue({ success: true });
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:restoreSession')!;
    await handler(fakeEvent(), 'sess-1');
    expect(store.updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ lastSeenAt: expect.any(Number) }));
  });

  it('does not touch lastSeenAt when spawnPty fails', async () => {
    const session = makeSession();
    const store = makeStore({ listSessions: vi.fn(() => [session]) });
    mockSpawnPty.mockResolvedValue({ success: false, error: 'spawn failed' });
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:restoreSession')!;
    await handler(fakeEvent(), 'sess-1');
    expect(store.updateSession).not.toHaveBeenCalled();
  });
});

describe('pty:discardPersistedSessions', () => {
  it('calls clearAll and returns success', async () => {
    const store = makeStore();
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:discardPersistedSessions')!;
    const result = await handler(fakeEvent());
    expect(store.clearAll).toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });

  it('returns success without calling clearAll when disabled', async () => {
    const store = makeStore({ isEnabled: vi.fn(() => false) });
    registerPtyPersistenceHandlers(makeSenderWindow(), store);
    const handler = registeredHandlers.get('pty:discardPersistedSessions')!;
    const result = await handler(fakeEvent());
    expect(store.clearAll).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });
});
