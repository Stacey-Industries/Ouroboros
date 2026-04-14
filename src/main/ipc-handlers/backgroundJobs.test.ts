/**
 * backgroundJobs.test.ts — unit tests for the backgroundJobs IPC handler.
 *
 * Mocks the scheduler singleton so no PTY or SQLite operations occur.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock Electron ─────────────────────────────────────────────────────────────

const mockHandle = vi.fn();
const mockSend = vi.fn();
const mockGetAllWindows = vi.fn(() => [
  { isDestroyed: () => false, webContents: { send: mockSend } },
]);

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockEnqueue = vi.fn().mockResolvedValue({ success: true, jobId: 'j1' });
const mockCancel = vi.fn().mockResolvedValue({ success: true });
const mockList = vi.fn().mockReturnValue({ jobs: [], runningCount: 0, queuedCount: 0, maxConcurrent: 2 });
const mockDeleteCompleted = vi.fn();
const mockReconcile = vi.fn();
const mockSubscribeChanges = vi.fn().mockReturnValue(() => {});

vi.mock('../backgroundJobs/jobScheduler', () => ({
  getJobScheduler: () => ({ enqueue: mockEnqueue, cancel: mockCancel, list: mockList }),
  initJobScheduler: vi.fn().mockReturnValue({ enqueue: mockEnqueue, cancel: mockCancel, list: mockList, dispose: vi.fn() }),
}));

vi.mock('../backgroundJobs/jobStore', () => ({
  getJobStore: () => ({
    deleteCompleted: mockDeleteCompleted,
    reconcileInterrupted: mockReconcile,
    subscribeChanges: mockSubscribeChanges,
  }),
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn().mockReturnValue(2),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../osNotification', () => ({
  notify: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHandler(channel: string) {
  const call = mockHandle.mock.calls.find(([c]) => c === channel);
  if (!call) throw new Error(`No handler registered for channel: ${channel}`);
  return call[1] as (...args: unknown[]) => Promise<unknown>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerBackgroundJobsHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('./backgroundJobs');
    mod.registerBackgroundJobsHandlers();
  });

  it('registers four IPC channels', () => {
    const channels = mockHandle.mock.calls.map(([c]) => c);
    expect(channels).toContain('backgroundJobs:enqueue');
    expect(channels).toContain('backgroundJobs:cancel');
    expect(channels).toContain('backgroundJobs:list');
    expect(channels).toContain('backgroundJobs:clearCompleted');
  });

  it('enqueue delegates to scheduler and returns jobId', async () => {
    const handler = getHandler('backgroundJobs:enqueue');
    const result = await handler({}, { projectRoot: '/p', prompt: 'do thing' });
    expect(result).toEqual({ success: true, jobId: 'j1' });
    expect(mockEnqueue).toHaveBeenCalledWith({ projectRoot: '/p', prompt: 'do thing' });
  });

  it('cancel delegates to scheduler', async () => {
    const handler = getHandler('backgroundJobs:cancel');
    const result = await handler({}, 'j1');
    expect(result).toEqual({ success: true });
    expect(mockCancel).toHaveBeenCalledWith('j1');
  });

  it('list returns snapshot', async () => {
    const handler = getHandler('backgroundJobs:list');
    const result = await handler({}, undefined) as { success: boolean; snapshot: unknown };
    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
  });

  it('clearCompleted calls store.deleteCompleted', async () => {
    const handler = getHandler('backgroundJobs:clearCompleted');
    const result = await handler({});
    expect(result).toEqual({ success: true });
    expect(mockDeleteCompleted).toHaveBeenCalled();
  });

  it('returns error result when scheduler throws', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('boom'));
    const handler = getHandler('backgroundJobs:enqueue');
    const result = await handler({}, { projectRoot: '/p', prompt: 'x' }) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });
});

describe('ensureSchedulerInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls reconcileInterrupted and initJobScheduler', async () => {
    const mod = await import('./backgroundJobs');
    mod.ensureSchedulerInit();
    expect(mockReconcile).toHaveBeenCalled();
    expect(mockSubscribeChanges).toHaveBeenCalled();
  });
});
