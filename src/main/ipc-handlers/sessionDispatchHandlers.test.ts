/**
 * sessionDispatchHandlers.test.ts — Wave 34 Phase B.
 *
 * Tests: validateProjectPath, dispatchTask handler, list handler, cancel handler.
 *
 * Run with:
 *   npx vitest run src/main/ipc-handlers/sessionDispatchHandlers.test.ts
 */

import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Stub Electron before any imports that pull it in ──────────────────────────

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

// ── Stub windowManager ────────────────────────────────────────────────────────

const { mockGetWindowProjectRoots } = vi.hoisted(() => ({
  mockGetWindowProjectRoots: vi.fn<(id: number) => string[]>(() => []),
}));
vi.mock('../windowManager', () => ({
  getWindowProjectRoots: mockGetWindowProjectRoots,
}));

// ── Stub config ───────────────────────────────────────────────────────────────

const { mockGetConfigValue } = vi.hoisted(() => ({
  mockGetConfigValue: vi.fn<(key: string) => unknown>(() => undefined),
}));
vi.mock('../config', () => ({
  getConfigValue: mockGetConfigValue,
}));

// ── Stub logger ───────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Stub sessionDispatchQueue ─────────────────────────────────────────────────

const { mockEnqueue, mockListJobs, mockCancelJob } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockListJobs: vi.fn<() => unknown[]>(() => []),
  mockCancelJob: vi.fn<(id: string) => { ok: boolean; reason?: string }>(
    () => ({ ok: true }),
  ),
}));

vi.mock('../session/sessionDispatchQueue', () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
  listJobs: () => mockListJobs(),
  cancelJob: (id: string) => mockCancelJob(id),
}));

// ── Import after all mocks ────────────────────────────────────────────────────

import {
  cleanupDispatchHandlers,
  registerDispatchHandlers,
  validateProjectPath,
} from './sessionDispatchHandlers';

// ── Helpers ───────────────────────────────────────────────────────────────────

const WIN_ROOT = process.platform === 'win32' ? 'C:\\projects\\myapp' : '/projects/myapp';
const WIN_ROOT_RESOLVED = path.resolve(WIN_ROOT);

function makeEvent(windowId: number | undefined = 1): Electron.IpcMainInvokeEvent {
  return {
    sender: {
      getOwnerBrowserWindow: () => (windowId !== undefined ? { id: windowId } : null),
    },
  } as unknown as Electron.IpcMainInvokeEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWindowProjectRoots.mockReturnValue([]);
  mockGetConfigValue.mockReturnValue(undefined);
  mockListJobs.mockReturnValue([]);
  mockCancelJob.mockReturnValue({ ok: true });
});

// ── validateProjectPath ───────────────────────────────────────────────────────

describe('validateProjectPath', () => {
  it('allows exact match against a window project root', () => {
    mockGetWindowProjectRoots.mockReturnValue([WIN_ROOT_RESOLVED]);
    expect(validateProjectPath(WIN_ROOT, 1)).toBe(true);
  });

  it('allows a subdirectory of a window project root', () => {
    mockGetWindowProjectRoots.mockReturnValue([WIN_ROOT_RESOLVED]);
    const sub = path.join(WIN_ROOT, 'src', 'foo');
    expect(validateProjectPath(sub, 1)).toBe(true);
  });

  it('rejects a path outside all roots', () => {
    mockGetWindowProjectRoots.mockReturnValue([WIN_ROOT_RESOLVED]);
    const outside = process.platform === 'win32' ? 'C:\\other' : '/other';
    expect(validateProjectPath(outside, 1)).toBe(false);
  });

  it('rejects a traversal attempt (..)', () => {
    mockGetWindowProjectRoots.mockReturnValue([WIN_ROOT_RESOLVED]);
    const traversal = path.join(WIN_ROOT, '..', 'evil');
    expect(validateProjectPath(traversal, 1)).toBe(false);
  });

  it('rejects when no roots configured at all', () => {
    mockGetWindowProjectRoots.mockReturnValue([]);
    mockGetConfigValue.mockReturnValue(undefined);
    expect(validateProjectPath(WIN_ROOT, 1)).toBe(false);
  });

  it('falls back to config.defaultProjectRoot', () => {
    mockGetWindowProjectRoots.mockReturnValue([]);
    mockGetConfigValue.mockImplementation((key: string) =>
      key === 'defaultProjectRoot' ? WIN_ROOT_RESOLVED : undefined,
    );
    expect(validateProjectPath(WIN_ROOT, 1)).toBe(true);
  });

  it('accepts a path under config.multiRoots', () => {
    mockGetWindowProjectRoots.mockReturnValue([]);
    mockGetConfigValue.mockImplementation((key: string) =>
      key === 'multiRoots' ? [WIN_ROOT_RESOLVED] : undefined,
    );
    const sub = path.join(WIN_ROOT, 'packages', 'lib');
    expect(validateProjectPath(sub, 1)).toBe(true);
  });
});

// ── registerDispatchHandlers (smoke) ─────────────────────────────────────────

describe('registerDispatchHandlers', () => {
  it('returns three channel names', () => {
    const channels = registerDispatchHandlers();
    expect(channels).toContain('sessions:dispatchTask');
    expect(channels).toContain('sessions:listDispatchJobs');
    expect(channels).toContain('sessions:cancelDispatchJob');
    cleanupDispatchHandlers();
  });
});

// ── handleDispatchTask (via captured handler) ─────────────────────────────────
//
// We capture the handler registered with ipcMain.handle and call it directly.

describe('sessions:dispatchTask handler', () => {
  let handler: (event: Electron.IpcMainInvokeEvent, req: unknown, devId?: string) => unknown;

  beforeEach(async () => {
    const { ipcMain } = await import('electron');
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      (channel: string, fn: unknown) => {
        if (channel === 'sessions:dispatchTask') {
          handler = fn as typeof handler;
        }
      },
    );
    mockGetWindowProjectRoots.mockReturnValue([WIN_ROOT_RESOLVED]);
    registerDispatchHandlers();
  });

  afterEach(() => cleanupDispatchHandlers());

  it('enqueues a valid request and returns jobId', async () => {
    mockEnqueue.mockReturnValue({ id: 'job-uuid-1' });

    const result = await handler(
      makeEvent(1),
      { title: 'Fix bug', prompt: 'Please fix it', projectPath: WIN_ROOT },
    ) as { success: boolean; jobId?: string };

    expect(result.success).toBe(true);
    expect(result.jobId).toBe('job-uuid-1');
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Fix bug', prompt: 'Please fix it' }),
      undefined,
    );
  });

  it('passes deviceId to enqueue', async () => {
    mockEnqueue.mockReturnValue({ id: 'job-uuid-2' });

    await handler(
      makeEvent(1),
      { title: 'T', prompt: 'P', projectPath: WIN_ROOT },
      'device-abc',
    );

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.anything(),
      'device-abc',
    );
  });

  it('rejects empty prompt with invalid-request', async () => {
    const result = await handler(
      makeEvent(1),
      { title: 'T', prompt: '', projectPath: WIN_ROOT },
    ) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^invalid-request/);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rejects empty title with invalid-request', async () => {
    const result = await handler(
      makeEvent(1),
      { title: '', prompt: 'Do it', projectPath: WIN_ROOT },
    ) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^invalid-request/);
  });

  it('rejects non-object request with invalid-request', async () => {
    const result = await handler(makeEvent(1), null) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^invalid-request/);
  });

  it('rejects a projectPath outside roots with project-path-not-allowed', async () => {
    const outside = process.platform === 'win32' ? 'C:\\evil\\path' : '/evil/path';
    const result = await handler(
      makeEvent(1),
      { title: 'T', prompt: 'P', projectPath: outside },
    ) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe('project-path-not-allowed');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rejects a traversal path with project-path-not-allowed', async () => {
    const traversal = path.join(WIN_ROOT, '..', 'sneaky');
    const result = await handler(
      makeEvent(1),
      { title: 'T', prompt: 'P', projectPath: traversal },
    ) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe('project-path-not-allowed');
  });
});

// ── handleListDispatchJobs ────────────────────────────────────────────────────

describe('sessions:listDispatchJobs handler', () => {
  let handler: () => unknown;

  beforeEach(async () => {
    const { ipcMain } = await import('electron');
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      (channel: string, fn: unknown) => {
        if (channel === 'sessions:listDispatchJobs') handler = fn as typeof handler;
      },
    );
    registerDispatchHandlers();
  });

  afterEach(() => cleanupDispatchHandlers());

  it('returns current queue snapshot', async () => {
    const jobs = [{ id: 'j1', status: 'queued' }];
    mockListJobs.mockReturnValue(jobs);

    const result = await handler() as { success: boolean; jobs?: unknown[] };
    expect(result.success).toBe(true);
    expect(result.jobs).toEqual(jobs);
  });

  it('returns empty array when queue is empty', async () => {
    mockListJobs.mockReturnValue([]);
    const result = await handler() as { success: boolean; jobs?: unknown[] };
    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(0);
  });
});

// ── handleCancelDispatchJob ───────────────────────────────────────────────────

describe('sessions:cancelDispatchJob handler', () => {
  let handler: (event: Electron.IpcMainInvokeEvent, jobId: string) => unknown;

  beforeEach(async () => {
    const { ipcMain } = await import('electron');
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      (channel: string, fn: unknown) => {
        if (channel === 'sessions:cancelDispatchJob') {
          handler = fn as typeof handler;
        }
      },
    );
    registerDispatchHandlers();
  });

  afterEach(() => cleanupDispatchHandlers());

  it('cancels a queued job successfully', async () => {
    mockCancelJob.mockReturnValue({ ok: true });
    const result = await handler(makeEvent(), 'job-123') as { success: boolean };
    expect(result.success).toBe(true);
    expect(mockCancelJob).toHaveBeenCalledWith('job-123');
  });

  it('marks active job canceled and returns success', async () => {
    mockCancelJob.mockReturnValue({ ok: true });
    const result = await handler(makeEvent(), 'job-running') as { success: boolean };
    expect(result.success).toBe(true);
  });

  it('returns failure with reason for terminal-state job', async () => {
    mockCancelJob.mockReturnValue({ ok: false, reason: 'already-terminal' });
    const result = await handler(makeEvent(), 'job-done') as {
      success: boolean;
      reason?: string;
    };
    expect(result.success).toBe(false);
    expect(result.reason).toBe('already-terminal');
  });

  it('returns failure for not-found job', async () => {
    mockCancelJob.mockReturnValue({ ok: false, reason: 'not-found' });
    const result = await handler(makeEvent(), 'nope') as {
      success: boolean;
      reason?: string;
    };
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not-found');
  });

  it('rejects empty jobId with invalid-job-id', async () => {
    const result = await handler(makeEvent(), '') as {
      success: boolean;
      reason?: string;
    };
    expect(result.success).toBe(false);
    expect(result.reason).toBe('invalid-job-id');
    expect(mockCancelJob).not.toHaveBeenCalled();
  });
});
