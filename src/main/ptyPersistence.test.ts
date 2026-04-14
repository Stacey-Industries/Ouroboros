/**
 * ptyPersistence.test.ts — Unit tests for the SQLite-backed PTY session store.
 *
 * Uses an in-memory SQLite path (temp dir) mirroring the pattern from
 * threadStoreSqlite.test.ts. The feature-flag no-op path is tested by
 * mocking getConfigValue directly.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron app.getPath so openPtyDb resolves inside our temp dir.
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tmpDir),
  },
}));

// We need tmpDir before the mock factory runs — hoist it.
let tmpDir: string;

// Mock config — default to flag ON; individual tests can override.
vi.mock('./config', () => ({
  getConfigValue: vi.fn(() => true),
}));

// Must import after mocks are set up.
import { getConfigValue } from './config';
import type { PersistedPtySession, PtyPersistence } from './ptyPersistence';
import { createPtyPersistence } from './ptyPersistence';

const mockGetConfigValue = vi.mocked(getConfigValue);

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

let store: PtyPersistence;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pty-persist-test-'));
  mockGetConfigValue.mockReturnValue(true as never);
  store = createPtyPersistence();
});

afterEach(() => {
  store.close();
  try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
});

describe('createPtyPersistence — flag OFF', () => {
  it('returns no-op when persistTerminalSessions is false', () => {
    mockGetConfigValue.mockReturnValue(false as never);
    const noop = createPtyPersistence();
    expect(noop.isEnabled()).toBe(false);
    // All calls must be no-ops (no throw, no persistence)
    noop.saveSession(makeSession());
    noop.updateSession('sess-1', { cols: 120 });
    noop.removeSession('sess-1');
    expect(noop.listSessions()).toEqual([]);
    noop.clearAll();
    noop.close();
  });
});

describe('createPtyPersistence — flag ON', () => {
  it('isEnabled returns true', () => {
    expect(store.isEnabled()).toBe(true);
  });

  describe('saveSession / listSessions roundtrip', () => {
    it('persists a session and reads it back', () => {
      const s = makeSession();
      store.saveSession(s);
      const list = store.listSessions();
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('sess-1');
      expect(list[0]?.cwd).toBe('/home/user/project');
      expect(list[0]?.shellPath).toBe('/bin/bash');
      expect(list[0]?.shellArgs).toEqual(['--login']);
      expect(list[0]?.cols).toBe(80);
      expect(list[0]?.rows).toBe(24);
      expect(list[0]?.windowId).toBe(1);
      expect(list[0]?.envHash).toBe('abc123');
    });

    it('handles null shellPath', () => {
      store.saveSession(makeSession({ shellPath: null }));
      const list = store.listSessions();
      expect(list[0]?.shellPath).toBeNull();
    });

    it('handles null windowId', () => {
      store.saveSession(makeSession({ windowId: null }));
      const list = store.listSessions();
      expect(list[0]?.windowId).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('updates cols and rows', () => {
      store.saveSession(makeSession());
      store.updateSession('sess-1', { cols: 120, rows: 40 });
      const list = store.listSessions();
      expect(list[0]?.cols).toBe(120);
      expect(list[0]?.rows).toBe(40);
    });

    it('updates lastSeenAt', () => {
      store.saveSession(makeSession({ lastSeenAt: 1_000_000 }));
      store.updateSession('sess-1', { lastSeenAt: 9_999_999 });
      const list = store.listSessions();
      expect(list[0]?.lastSeenAt).toBe(9_999_999);
    });

    it('is a no-op for empty patch', () => {
      store.saveSession(makeSession());
      store.updateSession('sess-1', {});
      expect(store.listSessions()).toHaveLength(1);
    });

    it('ignores unknown id gracefully', () => {
      store.updateSession('no-such-session', { cols: 200 });
      expect(store.listSessions()).toHaveLength(0);
    });
  });

  describe('removeSession', () => {
    it('deletes the session', () => {
      store.saveSession(makeSession());
      store.removeSession('sess-1');
      expect(store.listSessions()).toHaveLength(0);
    });

    it('is a no-op for unknown id', () => {
      store.saveSession(makeSession());
      store.removeSession('no-such');
      expect(store.listSessions()).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('removes all sessions', () => {
      store.saveSession(makeSession({ id: 'a' }));
      store.saveSession(makeSession({ id: 'b' }));
      store.clearAll();
      expect(store.listSessions()).toHaveLength(0);
    });
  });

  describe('multiple sessions', () => {
    it('lists sessions ordered by lastSeenAt descending', () => {
      store.saveSession(makeSession({ id: 'old', lastSeenAt: 1000 }));
      store.saveSession(makeSession({ id: 'new', lastSeenAt: 9000 }));
      const list = store.listSessions();
      expect(list[0]?.id).toBe('new');
      expect(list[1]?.id).toBe('old');
    });
  });
});
