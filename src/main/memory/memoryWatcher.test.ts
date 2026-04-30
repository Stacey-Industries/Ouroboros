/**
 * memoryWatcher.test.ts — smoke tests for the memory dir watcher.
 *
 * Acceptance criteria:
 *   1. watchRecursive is called with the correct memory dir path.
 *   2. A .md change triggers a debounced broadcast to all BrowserWindows.
 *   3. A non-.md change does NOT trigger a broadcast.
 *   4. The stop function closes the subscription.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks declared before module import ──────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockWatchRecursive, mockSubClose } = vi.hoisted(() => {
  const mockSubClose = vi.fn().mockResolvedValue(undefined);
  const mockWatchRecursive = vi.fn();
  return { mockWatchRecursive, mockSubClose };
});

vi.mock('../watchers', () => ({ watchRecursive: mockWatchRecursive }));

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{ webContents: { send: mockSend } }]),
  },
}));

vi.mock('../web/webServer', () => ({ broadcastToWebClients: vi.fn() }));

// ── Import module under test after mocks ─────────────────────────────────────

import os from 'os';

import { startMemoryWatcher } from './memoryWatcher';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_CWD = process.platform === 'win32' ? 'C:\\Web App\\Agent IDE' : '/home/user/project';

/** Flush all pending microtasks (resolved promises). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** Return the onEvent callback registered by watchRecursive call index. */
function getEventCallback(idx = 0): (event: { type: string; path: string }) => void {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into vitest mock.calls
  const call = mockWatchRecursive.mock.calls[idx];
  if (!call) throw new Error(`watchRecursive call ${idx} not found`);
  return call[2] as (event: { type: string; path: string }) => void;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockWatchRecursive.mockResolvedValue({ close: mockSubClose });
  mockSubClose.mockResolvedValue(undefined);
  vi.spyOn(os, 'homedir').mockReturnValue(
    process.platform === 'win32' ? 'C:\\Users\\tester' : '/home/tester',
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  mockWatchRecursive.mockReset();
  mockSubClose.mockReset();
  mockSend.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('startMemoryWatcher()', () => {
  it('calls watchRecursive with a path inside .claude/projects', async () => {
    startMemoryWatcher(FAKE_CWD);
    await flushMicrotasks();

    expect(mockWatchRecursive).toHaveBeenCalledTimes(1);
    const watchedPath: string = mockWatchRecursive.mock.calls[0][0] as string;
    expect(watchedPath).toContain('.claude');
    expect(watchedPath).toContain('memory');
  });

  it('broadcasts memory:changed after debounce when a .md file changes', async () => {
    startMemoryWatcher(FAKE_CWD);
    await flushMicrotasks();

    const onEvent = getEventCallback();
    onEvent({ type: 'update', path: '/some/dir/MEMORY.md' });

    expect(mockSend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(mockSend).toHaveBeenCalledWith('memory:changed');
  });

  it('does NOT broadcast for non-.md file changes', async () => {
    startMemoryWatcher(FAKE_CWD);
    await flushMicrotasks();

    const onEvent = getEventCallback();
    onEvent({ type: 'create', path: '/some/dir/note.txt' });

    vi.advanceTimersByTime(600);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('debounces multiple rapid .md events into a single broadcast', async () => {
    startMemoryWatcher(FAKE_CWD);
    await flushMicrotasks();

    const onEvent = getEventCallback();
    onEvent({ type: 'create', path: '/d/a.md' });
    onEvent({ type: 'update', path: '/d/b.md' });
    onEvent({ type: 'delete', path: '/d/c.md' });

    vi.advanceTimersByTime(600);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('closes the subscription on stop()', async () => {
    const stop = startMemoryWatcher(FAKE_CWD);
    await flushMicrotasks();

    stop();
    await flushMicrotasks();

    expect(mockSubClose).toHaveBeenCalledTimes(1);
  });

  it('skips silently when memory dir does not exist (ENOENT)', async () => {
    mockWatchRecursive.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    expect(() => startMemoryWatcher(FAKE_CWD)).not.toThrow();
    await flushMicrotasks();

    // No crash; no broadcast attempted from a non-existent watcher.
    vi.advanceTimersByTime(600);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
