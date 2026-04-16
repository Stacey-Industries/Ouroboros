/**
 * sessionStartup.test.ts — Smoke tests for the session startup wrapper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const initSessionStoreMock = vi.fn();
const closeSessionStoreMock = vi.fn();
const getSessionStoreMock = vi.fn().mockReturnValue(null);
vi.mock('./sessionStore', () => ({
  initSessionStore: (...args: unknown[]) => initSessionStoreMock(...args),
  closeSessionStore: (...args: unknown[]) => closeSessionStoreMock(...args),
  getSessionStore: (...args: unknown[]) => getSessionStoreMock(...args),
}));

const migrateMock = vi.fn().mockResolvedValue({ migrated: 0 });
vi.mock('./sessionMigration', () => ({
  migrateWindowSessionsToSessions: (...args: unknown[]) => migrateMock(...args),
}));

const runSessionGcMock = vi.fn().mockResolvedValue({ purged: 0 });
vi.mock('./sessionGc', () => ({
  runSessionGc: (...args: unknown[]) => runSessionGcMock(...args),
  SEVEN_DAYS_MS: 604_800_000,
}));

// Prevent the lazy require inside runAllGc from calling electron app.getPath
vi.mock('../agentChat/threadStore', () => ({
  agentChatThreadStore: null,
}));

const runSoftDeleteGcMock = vi.fn().mockResolvedValue({ purgedSessions: 0, purgedThreads: 0 });
vi.mock('./softDeleteGc', () => ({
  runSoftDeleteGc: (...args: unknown[]) => runSoftDeleteGcMock(...args),
}));

import { closeSessionServices, initSessionServices } from './sessionStartup';

describe('sessionStartup', () => {
  const get = vi.fn().mockReturnValue(undefined);
  const set = vi.fn();

  beforeEach(() => {
    initSessionStoreMock.mockClear();
    closeSessionStoreMock.mockClear();
    migrateMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initSessionServices calls initSessionStore then migration', async () => {
    await initSessionServices({ get, set });
    expect(initSessionStoreMock).toHaveBeenCalledTimes(1);
    expect(migrateMock).toHaveBeenCalledWith(get, set);
  });

  it('initSessionServices triggers GC at startup', async () => {
    runSessionGcMock.mockClear();
    await initSessionServices({ get, set });
    // GC fires async (void) — give microtasks a tick
    await Promise.resolve();
    expect(runSessionGcMock).toHaveBeenCalledTimes(1);
    closeSessionServices(); // clear interval
  });

  it('closeSessionServices delegates to closeSessionStore', () => {
    closeSessionServices();
    expect(closeSessionStoreMock).toHaveBeenCalledTimes(1);
  });

  it('initSessionServices awaits migration completion', async () => {
    let resolved = false;
    migrateMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve({ migrated: 3 });
          }, 5);
        }),
    );
    await initSessionServices({ get, set });
    expect(resolved).toBe(true);
  });
});
