/**
 * sessionGc.worktree.test.ts — Asserts that sessionGc calls worktreeManager.remove()
 * when GC deletes a session that has a worktree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./sessionLifecycle', () => ({
  emitSessionCreated: vi.fn(),
  emitSessionActivated: vi.fn(),
  emitSessionArchived: vi.fn(),
}));

vi.mock('./sessionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sessionStore')>();
  return { ...actual, getSessionStore: vi.fn() };
});

const mockWorktreeRemove = vi.fn();

vi.mock('./worktreeManager', () => ({
  getWorktreeManager: () => ({ remove: mockWorktreeRemove }),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import path from 'node:path';

import log from '../logger';
import type { Session } from './session';
import { makeSession } from './session';
import { runSessionGc } from './sessionGc';
import type { SessionStore } from './sessionStore';
import { getSessionStore, openSessionStore } from './sessionStore';
import type { TrashAdaptor } from './sessionTrash';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInMemoryStore(): SessionStore {
  const data: Session[] = [];
  return openSessionStore({
    read: () => [...data],
    write: (sessions) => {
      data.splice(0, data.length, ...sessions);
    },
  });
}

function makeMemTrashAdaptor(): TrashAdaptor & { store: Map<string, Session> } {
  const store = new Map<string, Session>();
  return {
    trashDir: '/mock/session-trash',
    store,
    readJson: async (fp: string) => store.get(fp) ?? null,
    writeJson: async (fp: string, s: Session) => {
      store.set(fp, s);
    },
    deleteFile: async (fp: string) => {
      store.delete(fp);
    },
    listFiles: async () => [...store.keys()],
    ensureDir: async () => {
      /* no-op */
    },
  };
}

function archiveWithTrash(
  store: SessionStore,
  trash: ReturnType<typeof makeMemTrashAdaptor>,
  session: Session,
  archivedAt: string,
): void {
  const archived = { ...session, archivedAt };
  store.upsert(archived);
  const trashKey = path.join('/mock/session-trash', `${session.id}.json`);
  trash.store.set(trashKey, archived);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sessionGc — worktree cleanup', () => {
  let store: SessionStore;
  let trash: ReturnType<typeof makeMemTrashAdaptor>;
  const NOW = new Date('2026-04-15T00:00:00Z').getTime();
  const EIGHT_DAYS_AGO = new Date(NOW - 8 * 24 * 3600 * 1000).toISOString();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'));
    vi.clearAllMocks();
    store = makeInMemoryStore();
    trash = makeMemTrashAdaptor();
    vi.mocked(getSessionStore).mockReturnValue(store);
    mockWorktreeRemove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls worktreeManager.remove() for expired sessions with a worktree', async () => {
    const session = makeSession('/projects/myrepo');
    const wtPath = '/projects/.ouroboros/worktrees/' + session.id;
    const worktreeSession: Session = { ...session, worktree: true, worktreePath: wtPath };
    archiveWithTrash(store, trash, worktreeSession, EIGHT_DAYS_AGO);

    await runSessionGc(NOW, trash);

    expect(mockWorktreeRemove).toHaveBeenCalledOnce();
    expect(mockWorktreeRemove).toHaveBeenCalledWith(wtPath);
  });

  it('does NOT call worktreeManager.remove() for plain sessions', async () => {
    const session = makeSession('/projects/plain');
    archiveWithTrash(store, trash, session, EIGHT_DAYS_AGO);

    await runSessionGc(NOW, trash);

    expect(mockWorktreeRemove).not.toHaveBeenCalled();
  });

  it('does NOT call worktreeManager.remove() for worktree sessions without worktreePath', async () => {
    const session = makeSession('/projects/incomplete');
    // worktree flag set but no worktreePath — incomplete state
    const incompleteSession: Session = { ...session, worktree: true };
    archiveWithTrash(store, trash, incompleteSession, EIGHT_DAYS_AGO);

    await runSessionGc(NOW, trash);

    expect(mockWorktreeRemove).not.toHaveBeenCalled();
  });

  it('continues GC (deletes session record) when worktree removal fails', async () => {
    mockWorktreeRemove.mockRejectedValue(new Error('git failed'));
    const session = makeSession('/projects/fail');
    const wtPath = '/projects/.ouroboros/worktrees/' + session.id;
    const worktreeSession: Session = { ...session, worktree: true, worktreePath: wtPath };
    archiveWithTrash(store, trash, worktreeSession, EIGHT_DAYS_AGO);

    const result = await runSessionGc(NOW, trash);

    // Session is still purged despite worktree removal failure
    expect(result.purged).toBe(1);
    expect(store.getById(session.id)).toBeUndefined();
  });

  it('logs a warning when worktree removal fails', async () => {
    const err = new Error('worktree not found');
    mockWorktreeRemove.mockRejectedValue(err);
    const session = makeSession('/projects/warn');
    const wtPath = '/projects/.ouroboros/worktrees/' + session.id;
    const worktreeSession: Session = { ...session, worktree: true, worktreePath: wtPath };
    archiveWithTrash(store, trash, worktreeSession, EIGHT_DAYS_AGO);

    await runSessionGc(NOW, trash);

    expect(vi.mocked(log).warn).toHaveBeenCalledWith(
      '[sessionGc] worktree removal failed',
      expect.objectContaining({ sessionId: session.id }),
    );
  });

  it('calls worktreeManager.remove() for each expired worktree session', async () => {
    const s1 = makeSession('/p1');
    const s2 = makeSession('/p2');
    const wt1 = '/p1/.ouroboros/worktrees/' + s1.id;
    const wt2 = '/p2/.ouroboros/worktrees/' + s2.id;
    archiveWithTrash(store, trash, { ...s1, worktree: true, worktreePath: wt1 }, EIGHT_DAYS_AGO);
    archiveWithTrash(store, trash, { ...s2, worktree: true, worktreePath: wt2 }, EIGHT_DAYS_AGO);

    await runSessionGc(NOW, trash);

    expect(mockWorktreeRemove).toHaveBeenCalledTimes(2);
    expect(mockWorktreeRemove).toHaveBeenCalledWith(wt1);
    expect(mockWorktreeRemove).toHaveBeenCalledWith(wt2);
  });
});
