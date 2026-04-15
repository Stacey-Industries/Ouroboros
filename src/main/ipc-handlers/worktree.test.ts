/**
 * worktree.test.ts — Unit tests for git:worktree* IPC handlers.
 *
 * Mocks: electron ipcMain, ../config getConfigValue, ../session/worktreeManager
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock electron ────────────────────────────────────────────────────────────

const handlers: Record<string, ((...args: unknown[]) => Promise<unknown>) | undefined> = {};

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
      // eslint-disable-next-line security/detect-object-injection -- channel is a controlled IPC string key
      handlers[channel] = fn;
    }),
    removeHandler: vi.fn((channel: string) => {
      // eslint-disable-next-line security/detect-object-injection -- channel is a controlled IPC string key
      delete handlers[channel];
    }),
  },
}));

// ─── Mock config ──────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
}));

// ─── Mock worktreeManager ─────────────────────────────────────────────────────

const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockList = vi.fn();
const mockExists = vi.fn();

vi.mock('../session/worktreeManager', () => ({
  getWorktreeManager: () => ({
    add: mockAdd,
    remove: mockRemove,
    list: mockList,
    exists: mockExists,
  }),
}));

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { cleanupWorktreeHandlers, registerWorktreeHandlers } from './worktree';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Invoke a registered handler as ipcMain would (event ignored by handlers). */
async function invoke(channel: string, args: unknown): Promise<unknown> {
  // eslint-disable-next-line security/detect-object-injection -- channel is a controlled IPC string key
  const fn = handlers[channel];
  if (!fn) throw new Error(`No handler registered for ${channel}`);
  return fn({} /* event */, args);
}

function enableFlag(): void {
  mockGetConfigValue.mockReturnValue({ worktreePerSession: true });
}

function disableFlag(): void {
  mockGetConfigValue.mockReturnValue({ worktreePerSession: false });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Register fresh handlers before each test
  registerWorktreeHandlers();
});

// ─── Feature flag off ─────────────────────────────────────────────────────────

describe('feature flag off', () => {
  beforeEach(disableFlag);

  it('git:worktreeAdd returns feature-flag-off', async () => {
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: 'sess-1',
    });
    expect(result).toEqual({ success: false, error: 'feature-flag-off' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('git:worktreeRemove returns feature-flag-off', async () => {
    const result = await invoke('git:worktreeRemove', { worktreePath: '/wt' });
    expect(result).toEqual({ success: false, error: 'feature-flag-off' });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('git:worktreeList returns feature-flag-off', async () => {
    const result = await invoke('git:worktreeList', { projectRoot: '/repo' });
    expect(result).toEqual({ success: false, error: 'feature-flag-off' });
    expect(mockList).not.toHaveBeenCalled();
  });
});

// ─── Happy paths ──────────────────────────────────────────────────────────────

describe('git:worktreeAdd', () => {
  beforeEach(enableFlag);

  it('returns success and path on add', async () => {
    mockAdd.mockResolvedValue({ path: '/repo/.ouroboros/worktrees/sess-1' });
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: 'sess-1',
    });
    expect(result).toEqual({ success: true, path: '/repo/.ouroboros/worktrees/sess-1' });
    expect(mockAdd).toHaveBeenCalledWith('/repo', 'sess-1');
  });

  it('returns failure when projectRoot missing', async () => {
    const result = await invoke('git:worktreeAdd', { sessionId: 'sess-1' });
    expect((result as { success: boolean }).success).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('returns failure when sessionId missing', async () => {
    const result = await invoke('git:worktreeAdd', { projectRoot: '/repo' });
    expect((result as { success: boolean }).success).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('wraps manager errors in failure shape', async () => {
    mockAdd.mockRejectedValue(new Error('git failed'));
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: 'sess-1',
    });
    expect(result).toEqual({ success: false, error: 'git failed' });
  });
});

describe('git:worktreeRemove', () => {
  beforeEach(enableFlag);

  it('returns success on remove', async () => {
    mockRemove.mockResolvedValue(undefined);
    const result = await invoke('git:worktreeRemove', {
      worktreePath: '/repo/.ouroboros/worktrees/sess-1',
    });
    expect(result).toEqual({ success: true });
    expect(mockRemove).toHaveBeenCalledWith('/repo/.ouroboros/worktrees/sess-1');
  });

  it('returns failure when worktreePath missing', async () => {
    const result = await invoke('git:worktreeRemove', {});
    expect((result as { success: boolean }).success).toBe(false);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

describe('git:worktreeList', () => {
  beforeEach(enableFlag);

  it('returns success and worktrees array', async () => {
    const fakeRecords = [
      { path: '/repo', branch: 'main', head: 'abc', isMain: true },
      { path: '/repo/.ouroboros/worktrees/sess-1', branch: 'feat', head: 'def', isMain: false },
    ];
    mockList.mockResolvedValue(fakeRecords);
    const result = await invoke('git:worktreeList', { projectRoot: '/repo' });
    expect(result).toEqual({ success: true, worktrees: fakeRecords });
  });

  it('returns failure when projectRoot missing', async () => {
    const result = await invoke('git:worktreeList', {});
    expect((result as { success: boolean }).success).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

// Capture the mocked ipcMain at the top level — vi.mock hoists the mock so
// importing electron here returns the same mock object used by the SUT.
import { ipcMain as mockedIpcMain } from 'electron';

describe('cleanupWorktreeHandlers', () => {
  it('removes all registered channels', () => {
    cleanupWorktreeHandlers();
    expect(vi.mocked(mockedIpcMain).removeHandler).toHaveBeenCalledWith('git:worktreeAdd');
    expect(vi.mocked(mockedIpcMain).removeHandler).toHaveBeenCalledWith('git:worktreeRemove');
    expect(vi.mocked(mockedIpcMain).removeHandler).toHaveBeenCalledWith('git:worktreeList');
  });
});
