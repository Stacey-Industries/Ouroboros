/**
 * files.test.ts — Unit tests for the file-tree watcher adapter in files.ts.
 *
 * Covers: watcher creation, deduplication, MAX_WATCHERS eviction, event-type
 * mapping (create→add/addDir, update→change, delete→unlink/unlinkDir), and
 * unwatch cleanup.
 *
 * Run with: npx vitest run src/main/ipc-handlers/files
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Electron stub ──────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: { getPath: () => '/mock/userData', getAppPath: () => '/mock/app' },
  BrowserWindow: { getAllWindows: vi.fn(() => []), getFocusedWindow: vi.fn(() => null) },
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: vi.fn() },
}));

// ── Logger stub ────────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── windowManager stub ─────────────────────────────────────────────────────────
vi.mock('../windowManager', () => ({
  getWindowProjectRoots: vi.fn().mockReturnValue([]),
}));

// ── config stub ────────────────────────────────────────────────────────────────
vi.mock('../config', () => ({ getConfigValue: vi.fn() }));

// ── pathSecurity stub — allow everything by default ────────────────────────────
const { mockAssertPathAllowed } = vi.hoisted(() => ({
  mockAssertPathAllowed: vi.fn().mockReturnValue(null),
}));
vi.mock('./pathSecurity', () => ({
  assertPathAllowed: mockAssertPathAllowed,
  isTrustedConfigPath: vi.fn().mockReturnValue(false),
  isTrustedVsxExtensionPath: vi.fn().mockReturnValue(false),
}));

// ── filesHelpers stub ──────────────────────────────────────────────────────────
const { mockBroadcastFileChange } = vi.hoisted(() => ({
  mockBroadcastFileChange: vi.fn(),
}));
vi.mock('./filesHelpers', () => ({
  broadcastFileChange: mockBroadcastFileChange,
  createDirItem: vi.fn(),
  createExclusiveFile: vi.fn(),
  createOpenFileHandler: vi.fn(() => vi.fn()),
  createSelectFolderHandler: vi.fn(() => vi.fn()),
  ensureDirExists: vi.fn(),
  flushFileChangesOnShutdown: vi.fn(),
  handleShowImageDialog: vi.fn(),
  handleSoftDeleteOp: vi.fn(),
  isTempDeletionPath: vi.fn(),
  listDirectoryItems: vi.fn(),
  loadBinaryContent: vi.fn(),
  loadImageAttachment: vi.fn(),
  loadTextContent: vi.fn(),
  mimeTypeForImage: vi.fn(() => 'image/png'),
  movePath: vi.fn(),
  pathExists: vi.fn(),
  readFileWithLimit: vi.fn(),
  MAX_READ_BYTES: 100 * 1024 * 1024,
  toErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  toErrorResult: vi.fn((err: unknown) => ({
    success: false,
    error: err instanceof Error ? err.message : String(err),
  })),
  writeBinaryFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

// ── @parcel/watcher stub via ../watchers ───────────────────────────────────────
type WatchCallback = (event: { type: 'create' | 'update' | 'delete'; path: string }) => void;
interface MockSubscription {
  close: ReturnType<typeof vi.fn>;
}

let capturedCallback: WatchCallback | null = null;
const mockSubscriptions: MockSubscription[] = [];

const { mockWatchRecursive } = vi.hoisted(() => ({
  mockWatchRecursive: vi.fn(),
}));

vi.mock('../watchers', () => ({
  watchRecursive: mockWatchRecursive,
}));

// ── fs/promises stub (for resolveChangeType's stat call) ───────────────────────
// Only stat is needed; other fs/promises methods are exercised through filesHelpers
// which is separately mocked. We stub the entire module to keep it simple.
const { mockStat } = vi.hoisted(() => ({ mockStat: vi.fn() }));
vi.mock('fs/promises', () => ({
  default: {
    stat: mockStat,
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
    rename: vi.fn(),
    copyFile: vi.fn(),
    unlink: vi.fn(),
    rm: vi.fn(),
  },
  stat: mockStat,
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

// Inline event type because we can't import the Electron internal easily.
type FakeEvent = { sender: { id: number } };

function fakeEvent(): FakeEvent {
  return { sender: { id: 1 } };
}

/** Flush all pending microtasks — more robust than a fixed number of Promise.resolve() calls. */
async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

// ── Reset between tests ────────────────────────────────────────────────────────
// resetModules() clears the module cache so each test gets a fresh `watchers`
// Map (the module-level state in files.ts). Without this, watcher state bleeds
// between tests and the deduplication / eviction counts are wrong.

beforeEach(() => {
  vi.resetModules();
  capturedCallback = null;
  mockSubscriptions.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Import module under test after all mocks are in place ─────────────────────
// (Dynamic import so hoisted mocks are registered first)
async function loadModule() {
  const mod = await import('./files');
  return mod;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: set up mockWatchRecursive to capture callback and return subscription
// ─────────────────────────────────────────────────────────────────────────────

function setupWatchMock() {
  mockWatchRecursive.mockImplementation(
    (_root: string, _opts: unknown, cb: WatchCallback): Promise<MockSubscription> => {
      capturedCallback = cb;
      const sub: MockSubscription = { close: vi.fn().mockResolvedValue(undefined) };
      mockSubscriptions.push(sub);
      return Promise.resolve(sub);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe('registerFileHandlers — watcher registration', () => {
  it('registers files:watchDir and files:unwatchDir channels', async () => {
    const { ipcMain } = await import('electron');
    setupWatchMock();
    const { registerFileHandlers } = await loadModule();
    const senderWindow = vi.fn();
    const channels = registerFileHandlers(senderWindow as never);
    expect(channels).toContain('files:watchDir');
    expect(channels).toContain('files:unwatchDir');
    expect(ipcMain.handle).toHaveBeenCalled();
  });
});

describe('watchDirectory — creation', () => {
  beforeEach(() => { setupWatchMock(); });

  it('calls watchRecursive with correct ignore globs', async () => {
    const { registerFileHandlers } = await loadModule();
    registerFileHandlers(vi.fn() as never);

    // Directly exercise watchDirectory via the registered IPC handler.
    // We grab handler[3] = files:watchDir index from the registration list.
    // Instead, use the exported internals via a helper: call handleWatchDir indirectly
    // by triggering ipcMain.handle's captured handler. This is simplest via the
    // cleanupFileWatchers / watchDirectory path — test via exported cleanupFileWatchers.
    // Simplest approach: import and invoke the handler through ipcMain.handle mock capture.

    const { ipcMain } = await import('electron');
    const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const watchDirEntry = calls.find((c: unknown[]) => c[0] === 'files:watchDir');
    expect(watchDirEntry).toBeTruthy();
    const handler = watchDirEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;

    const result = await handler(fakeEvent(), '/some/project');
    expect(result).toMatchObject({ success: true });
    expect(mockWatchRecursive).toHaveBeenCalledOnce();
    const [root, opts] = mockWatchRecursive.mock.calls[0] as [string, { ignore: string[] }];
    expect(root).toBe('/some/project');
    expect(opts.ignore).toContain('**/node_modules/**');
    expect(opts.ignore).toContain('**/.git/**');
    expect(opts.ignore).toContain('**/.*/**');
  });

  it('returns already:true when the same dir is watched twice', async () => {
    const { registerFileHandlers } = await loadModule();
    registerFileHandlers(vi.fn() as never);

    const { ipcMain } = await import('electron');
    const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const watchDirEntry = calls.find((c: unknown[]) => c[0] === 'files:watchDir');
    const handler = watchDirEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;

    await handler(fakeEvent(), '/some/project');
    const second = await handler(fakeEvent(), '/some/project');
    expect(second).toMatchObject({ success: true, already: true });
    expect(mockWatchRecursive).toHaveBeenCalledOnce();
  });
});

describe('evictOldestWatcher — MAX_WATCHERS limit', () => {
  beforeEach(() => { setupWatchMock(); });

  it('evicts the oldest watcher when limit is exceeded', async () => {
    const { registerFileHandlers } = await loadModule();
    registerFileHandlers(vi.fn() as never);

    const { ipcMain } = await import('electron');
    const allCalls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const watchDirEntry = allCalls.find((c: unknown[]) => c[0] === 'files:watchDir');
    const handler = watchDirEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;

    // Fill up to MAX_WATCHERS (8) then add one more.
    for (let i = 0; i < 9; i++) {
      await handler(fakeEvent(), `/project/${i}`);
    }

    // 9 subscriptions created total (8 + the 9th that caused eviction of #0).
    expect(mockWatchRecursive).toHaveBeenCalledTimes(9);
    // The first subscription (index 0) should have been closed.
    expect(mockSubscriptions[0].close).toHaveBeenCalledOnce();
    // Subscriptions 1–8 should still be open.
    for (let i = 1; i < 9; i++) {
      // eslint-disable-next-line security/detect-object-injection -- numeric loop index into test fixture array
      expect(mockSubscriptions[i].close).not.toHaveBeenCalled();
    }
  });
});

describe('cleanupFileWatchers', () => {
  beforeEach(() => { setupWatchMock(); });

  it('closes all subscriptions and clears the map', async () => {
    const { registerFileHandlers, cleanupFileWatchers } = await loadModule();
    registerFileHandlers(vi.fn() as never);

    const { ipcMain } = await import('electron');
    const allCalls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const watchDirEntry = allCalls.find((c: unknown[]) => c[0] === 'files:watchDir');
    const handler = watchDirEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;

    await handler(fakeEvent(), '/proj/a');
    await handler(fakeEvent(), '/proj/b');

    cleanupFileWatchers();
    expect(mockSubscriptions[0].close).toHaveBeenCalled();
    expect(mockSubscriptions[1].close).toHaveBeenCalled();
  });
});

describe('handleUnwatchDir', () => {
  beforeEach(() => { setupWatchMock(); });

  it('closes and removes a watched directory', async () => {
    const { registerFileHandlers } = await loadModule();
    registerFileHandlers(vi.fn() as never);

    const { ipcMain } = await import('electron');
    const allCalls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const watchEntry = allCalls.find((c: unknown[]) => c[0] === 'files:watchDir');
    const unwatchEntry = allCalls.find((c: unknown[]) => c[0] === 'files:unwatchDir');
    const watchHandler = watchEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;
    const unwatchHandler = unwatchEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;

    await watchHandler(fakeEvent(), '/my/project');
    const result = await unwatchHandler(fakeEvent(), '/my/project');

    expect(result).toMatchObject({ success: true });
    expect(mockSubscriptions[0].close).toHaveBeenCalledOnce();
  });

  it('returns success even if dir was never watched', async () => {
    const { registerFileHandlers } = await loadModule();
    registerFileHandlers(vi.fn() as never);

    const { ipcMain } = await import('electron');
    const allCalls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const unwatchEntry = allCalls.find((c: unknown[]) => c[0] === 'files:unwatchDir');
    const handler = unwatchEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;

    const result = await handler(fakeEvent(), '/not/watched');
    expect(result).toMatchObject({ success: true });
  });
});

describe('event-type mapping (resolveChangeType)', () => {
  beforeEach(() => { setupWatchMock(); });

  async function getWatchHandler() {
    const { registerFileHandlers } = await loadModule();
    registerFileHandlers(vi.fn() as never);
    const { ipcMain } = await import('electron');
    const allCalls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const watchEntry = allCalls.find((c: unknown[]) => c[0] === 'files:watchDir');
    return watchEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;
  }

  it('maps parcel update → change', async () => {
    const handler = await getWatchHandler();
    await handler(fakeEvent(), '/p');
    capturedCallback!({ type: 'update', path: '/p/file.ts' });
    await flushMicrotasks();
    expect(mockBroadcastFileChange).toHaveBeenCalledWith('change', '/p/file.ts');
  });

  it('maps parcel create (file) → add', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => false });
    const handler = await getWatchHandler();
    await handler(fakeEvent(), '/p');
    capturedCallback!({ type: 'create', path: '/p/newfile.ts' });
    await flushMicrotasks();
    expect(mockBroadcastFileChange).toHaveBeenCalledWith('add', '/p/newfile.ts');
  });

  it('maps parcel create (directory) → addDir', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    const handler = await getWatchHandler();
    await handler(fakeEvent(), '/p');
    capturedCallback!({ type: 'create', path: '/p/newdir' });
    await flushMicrotasks();
    expect(mockBroadcastFileChange).toHaveBeenCalledWith('addDir', '/p/newdir');
  });

  it('maps parcel delete (unknown path) → unlink', async () => {
    const handler = await getWatchHandler();
    await handler(fakeEvent(), '/p');
    capturedCallback!({ type: 'delete', path: '/p/gone.ts' });
    await flushMicrotasks();
    expect(mockBroadcastFileChange).toHaveBeenCalledWith('unlink', '/p/gone.ts');
  });

  it('maps parcel delete (previously seen dir) → unlinkDir', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    const handler = await getWatchHandler();
    await handler(fakeEvent(), '/p');
    // First create to register in dirSet
    capturedCallback!({ type: 'create', path: '/p/adir' });
    await flushMicrotasks();
    // Now delete
    capturedCallback!({ type: 'delete', path: '/p/adir' });
    await flushMicrotasks();
    const calls = mockBroadcastFileChange.mock.calls;
    expect(calls[0]).toEqual(['addDir', '/p/adir']);
    expect(calls[1]).toEqual(['unlinkDir', '/p/adir']);
  });

  it('maps parcel create (stat fails) → add as fallback', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    const handler = await getWatchHandler();
    await handler(fakeEvent(), '/p');
    capturedCallback!({ type: 'create', path: '/p/ghost.ts' });
    await flushMicrotasks();
    expect(mockBroadcastFileChange).toHaveBeenCalledWith('add', '/p/ghost.ts');
  });
});

describe('pathSecurity enforcement', () => {
  it('returns denied result when assertPathAllowed rejects', async () => {
    mockAssertPathAllowed.mockReturnValueOnce({ success: false, error: 'Access denied' });
    setupWatchMock();
    const { registerFileHandlers } = await loadModule();
    registerFileHandlers(vi.fn() as never);

    const { ipcMain } = await import('electron');
    const allCalls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
    const watchEntry = allCalls.find((c: unknown[]) => c[0] === 'files:watchDir');
    const handler = watchEntry![1] as (event: FakeEvent, p: string) => Promise<unknown>;

    const result = await handler(fakeEvent(), '/disallowed');
    expect(result).toMatchObject({ success: false, error: 'Access denied' });
    expect(mockWatchRecursive).not.toHaveBeenCalled();
  });
});
