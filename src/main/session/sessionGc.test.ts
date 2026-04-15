/**
 * sessionGc.test.ts — Unit tests for the session GC task.
 *
 * Uses vi.useFakeTimers + vi.setSystemTime for deterministic time control,
 * an in-memory SessionStore (openSessionStore), and an in-memory TrashAdaptor.
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

import path from 'node:path';

import type { Session } from './session';
import { makeSession } from './session';
import { runSessionGc,SEVEN_DAYS_MS } from './sessionGc';
import type { SessionStore } from './sessionStore';
import { getSessionStore, openSessionStore } from './sessionStore';
import type { TrashAdaptor } from './sessionTrash';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInMemoryStore(): SessionStore {
  const data: Session[] = [];
  return openSessionStore({
    read: () => [...data],
    write: (sessions) => { data.splice(0, data.length, ...sessions); },
  });
}

function makeMemTrashAdaptor(): TrashAdaptor & { store: Map<string, Session> } {
  const store = new Map<string, Session>();
  return {
    trashDir: '/mock/session-trash',
    store,
    readJson: async (fp: string) => store.get(fp) ?? null,
    writeJson: async (fp: string, s: Session) => { store.set(fp, s); },
    deleteFile: async (fp: string) => { store.delete(fp); },
    listFiles: async () => [...store.keys()],
    ensureDir: async () => { /* no-op */ },
  };
}

/** Archive a session and plant a trash file at the expected key. */
function archiveWithTrash(
  store: SessionStore,
  trash: ReturnType<typeof makeMemTrashAdaptor>,
  session: Session,
  archivedAt: string,
): void {
  const archived = { ...session, archivedAt };
  store.upsert(archived);
  // Use path.join so the key matches what sessionTrash.ts produces at runtime.
  const trashKey = path.join('/mock/session-trash', `${session.id}.json`);
  trash.store.set(trashKey, archived);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runSessionGc', () => {
  let store: SessionStore;
  let trash: ReturnType<typeof makeMemTrashAdaptor>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'));
    store = makeInMemoryStore();
    trash = makeMemTrashAdaptor();
    vi.mocked(getSessionStore).mockReturnValue(store);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns purged:0 when there are no sessions', async () => {
    const result = await runSessionGc(Date.now(), trash);
    expect(result.purged).toBe(0);
  });

  it('returns purged:0 when store is not initialised', async () => {
    vi.mocked(getSessionStore).mockReturnValue(null);
    const result = await runSessionGc(Date.now(), trash);
    expect(result.purged).toBe(0);
  });

  it('does not purge a session that has no archivedAt', async () => {
    store.upsert(makeSession('/projects/active'));
    const result = await runSessionGc(Date.now(), trash);
    expect(result.purged).toBe(0);
    expect(store.listAll()).toHaveLength(1);
  });

  it('does not purge an archived session within the 7-day grace period', async () => {
    const now = Date.now();
    const session = makeSession('/projects/recent');
    const sixDaysAgo = new Date(now - 6 * 24 * 3600 * 1000).toISOString();
    archiveWithTrash(store, trash, session, sixDaysAgo);
    const result = await runSessionGc(now, trash);
    expect(result.purged).toBe(0);
    expect(store.getById(session.id)).toBeDefined();
  });

  it('purges an archived session older than 7 days', async () => {
    const now = Date.now();
    const session = makeSession('/projects/old');
    const eightDaysAgo = new Date(now - 8 * 24 * 3600 * 1000).toISOString();
    archiveWithTrash(store, trash, session, eightDaysAgo);
    const result = await runSessionGc(now, trash);
    expect(result.purged).toBe(1);
    expect(store.getById(session.id)).toBeUndefined();
  });

  it('deletes the trash file when purging', async () => {
    const now = Date.now();
    const session = makeSession('/projects/old2');
    const eightDaysAgo = new Date(now - 8 * 24 * 3600 * 1000).toISOString();
    archiveWithTrash(store, trash, session, eightDaysAgo);
    expect(trash.store.size).toBe(1);
    await runSessionGc(now, trash);
    expect(trash.store.size).toBe(0);
  });

  it('purges only expired sessions and keeps fresh ones', async () => {
    const now = Date.now();

    const fresh = makeSession('/projects/fresh');
    const old = makeSession('/projects/old');
    const twoDaysAgo = new Date(now - 2 * 24 * 3600 * 1000).toISOString();
    const ninetyDaysAgo = new Date(now - 90 * 24 * 3600 * 1000).toISOString();

    archiveWithTrash(store, trash, fresh, twoDaysAgo);
    archiveWithTrash(store, trash, old, ninetyDaysAgo);

    const result = await runSessionGc(now, trash);
    expect(result.purged).toBe(1);
    expect(store.getById(fresh.id)).toBeDefined();
    expect(store.getById(old.id)).toBeUndefined();
  });

  it('does not purge a session archived exactly at the 7-day boundary', async () => {
    const now = Date.now();
    const session = makeSession('/projects/boundary');
    // exactly 7 days ago → archivedAt + SEVEN_DAYS_MS === now → not < now
    const exactBoundary = new Date(now - SEVEN_DAYS_MS).toISOString();
    archiveWithTrash(store, trash, session, exactBoundary);
    const result = await runSessionGc(now, trash);
    expect(result.purged).toBe(0);
  });

  it('purges multiple expired sessions in one pass', async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 3600 * 1000).toISOString();
    const s1 = makeSession('/p1');
    const s2 = makeSession('/p2');
    const s3 = makeSession('/p3');
    archiveWithTrash(store, trash, s1, tenDaysAgo);
    archiveWithTrash(store, trash, s2, tenDaysAgo);
    archiveWithTrash(store, trash, s3, tenDaysAgo);
    const result = await runSessionGc(now, trash);
    expect(result.purged).toBe(3);
    expect(store.listAll()).toHaveLength(0);
  });
});
