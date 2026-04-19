/**
 * worktree.pathSecurity.test.ts — IPC boundary validation for git:worktreeAdd.
 *
 * Covers:
 *   - Non-UUID sessionId → rejected with 'invalid-session-id'
 *   - projectRoot outside allowed roots → rejected by assertPathAllowed
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

// ─── Mock pathSecurity ────────────────────────────────────────────────────────

const mockAssertPathAllowed = vi.fn();

vi.mock('./pathSecurity', () => ({
  assertPathAllowed: (...args: unknown[]) => mockAssertPathAllowed(...args),
}));

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { registerWorktreeHandlers } from './worktree';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const FAKE_EVENT = {} as import('electron').IpcMainInvokeEvent;

async function invoke(channel: string, args: unknown): Promise<unknown> {
  // eslint-disable-next-line security/detect-object-injection -- channel is a controlled IPC string key
  const fn = handlers[channel];
  if (!fn) throw new Error(`No handler registered for ${channel}`);
  return fn(FAKE_EVENT, args);
}

function enableFlag(): void {
  mockGetConfigValue.mockReturnValue({ worktreePerSession: true });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  enableFlag();
  registerWorktreeHandlers();
  // Default: path is allowed
  mockAssertPathAllowed.mockReturnValue(null);
  mockAdd.mockResolvedValue({ path: '/repo/.ouroboros/worktrees/' + VALID_UUID });
});

// ─── sessionId UUID validation ────────────────────────────────────────────────

describe('git:worktreeAdd — sessionId validation', () => {
  it('rejects a non-UUID sessionId', async () => {
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: 'not-a-uuid',
    });
    expect(result).toEqual({ success: false, error: 'invalid-session-id' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('rejects an empty sessionId', async () => {
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: '',
    });
    // empty string → caught by "required" check before UUID check
    expect((result as { success: boolean }).success).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('rejects a sessionId with SQL injection attempt', async () => {
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: "'; DROP TABLE sessions; --",
    });
    expect(result).toEqual({ success: false, error: 'invalid-session-id' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('rejects a sessionId with path traversal characters', async () => {
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: '../../etc/passwd',
    });
    expect(result).toEqual({ success: false, error: 'invalid-session-id' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('accepts a valid UUID v4 sessionId', async () => {
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: VALID_UUID,
    });
    expect((result as { success: boolean }).success).toBe(true);
    expect(mockAdd).toHaveBeenCalledWith('/repo', VALID_UUID);
  });
});

// ─── projectRoot path security ────────────────────────────────────────────────

describe('git:worktreeAdd — projectRoot path security', () => {
  it('rejects projectRoot outside allowed workspace roots', async () => {
    mockAssertPathAllowed.mockReturnValue({
      success: false,
      error: 'Path "/etc/passwd" is outside the workspace and cannot be accessed.',
    });
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/etc/passwd',
      sessionId: VALID_UUID,
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('calls assertPathAllowed with the supplied projectRoot', async () => {
    await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: VALID_UUID,
    });
    expect(mockAssertPathAllowed).toHaveBeenCalledWith(FAKE_EVENT, '/repo');
  });

  it('proceeds when projectRoot is inside allowed roots', async () => {
    mockAssertPathAllowed.mockReturnValue(null);
    const result = await invoke('git:worktreeAdd', {
      projectRoot: '/repo',
      sessionId: VALID_UUID,
    });
    expect((result as { success: boolean }).success).toBe(true);
  });
});
