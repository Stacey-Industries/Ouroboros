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

const runSessionGcMock = vi.fn().mockResolvedValue({ purged: 0 });
vi.mock('./sessionGc', () => ({
  runSessionGc: (...args: unknown[]) => runSessionGcMock(...args),
  SEVEN_DAYS_MS: 604_800_000,
}));

// Prevent the lazy require inside runAllGc from calling electron app.getPath
vi.mock('../agentChat/threadStore', () => ({
  agentChatThreadStore: null,
}));

vi.mock('../orchestration/pinnedContextStore', () => ({
  initPinnedContextStore: vi.fn(),
  closePinnedContextStore: vi.fn(),
}));

vi.mock('../profiles/profileStore', () => ({
  initProfileStore: vi.fn(),
  closeProfileStore: vi.fn(),
}));

vi.mock('./folderStore', () => ({
  initFolderStore: vi.fn(),
  closeFolderStore: vi.fn(),
}));

const runSoftDeleteGcMock = vi.fn().mockResolvedValue({ purgedSessions: 0, purgedThreads: 0 });
vi.mock('./softDeleteGc', () => ({
  runSoftDeleteGc: (...args: unknown[]) => runSoftDeleteGcMock(...args),
}));

// Wave 34 Phase C: sessionStartup now imports from config, sessionDispatchQueue,
// and sessionDispatchRunner. Mock all three so electron-store is never loaded.
vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => undefined),
}));

vi.mock('./sessionDispatchQueue', () => ({
  loadQueue: vi.fn(),
}));

vi.mock('./sessionDispatchRunner', () => ({
  startDispatchRunner: vi.fn(),
  stopDispatchRunner: vi.fn(),
}));

import { closeSessionServices, initSessionServices } from './sessionStartup';

describe('sessionStartup', () => {
  beforeEach(() => {
    initSessionStoreMock.mockClear();
    closeSessionStoreMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initSessionServices calls initSessionStore', async () => {
    await initSessionServices();
    expect(initSessionStoreMock).toHaveBeenCalledTimes(1);
    closeSessionServices(); // clear interval
  });

  it('initSessionServices triggers GC at startup', async () => {
    runSessionGcMock.mockClear();
    await initSessionServices();
    // GC fires async (void) — give microtasks a tick
    await Promise.resolve();
    expect(runSessionGcMock).toHaveBeenCalledTimes(1);
    closeSessionServices(); // clear interval
  });

  it('closeSessionServices delegates to closeSessionStore', () => {
    closeSessionServices();
    expect(closeSessionStoreMock).toHaveBeenCalledTimes(1);
  });
});
