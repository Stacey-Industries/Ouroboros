/**
 * useThreadCheckpoints.test.ts — Smoke tests for useThreadCheckpoints hook.
 *
 * Verifies: fetch on mount, re-fetch on onChange push, empty state when
 * threadId is null, no cross-thread leakage from push events.
 *
 * @vitest-environment jsdom
 */

import type { SessionCheckpoint } from '@shared/types/sessionCheckpoint';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Minimal ElectronAPI mock ───────────────────────────────────────────────

type OnChangeCallback = (threadId: string) => void;

const mockCheckpoints: SessionCheckpoint[] = [
  {
    id: 'cp-1',
    threadId: 'thread-abc',
    messageId: 'msg-1',
    commitHash: 'deadbeef',
    filesChanged: ['src/a.ts'],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

let onChangeCb: OnChangeCallback | null = null;

const mockApi = {
  checkpoint: {
    list: vi.fn().mockResolvedValue({ success: true, checkpoints: mockCheckpoints }),
    create: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
    onChange: vi.fn((cb: OnChangeCallback) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = null;
      };
    }),
  },
};

// ── ProjectContext mock ────────────────────────────────────────────────────

vi.mock('../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/tmp/project' }),
}));

beforeEach(() => {
  onChangeCb = null;
  vi.clearAllMocks();
  mockApi.checkpoint.list.mockResolvedValue({ success: true, checkpoints: mockCheckpoints });
  vi.stubGlobal('window', { electronAPI: mockApi });
});

// ── Tests ─────────────────────────────────────────────────────────────────

import { useThreadCheckpoints } from './useThreadCheckpoints';

describe('useThreadCheckpoints', () => {
  it('fetches checkpoints on mount for a given threadId', async () => {
    renderHook(() => useThreadCheckpoints('thread-abc'));
    await act(async () => {});
    expect(mockApi.checkpoint.list).toHaveBeenCalledWith({
      threadId: 'thread-abc',
      projectRoot: '/tmp/project',
    });
  });

  it('returns empty array when threadId is null', async () => {
    const { result } = renderHook(() => useThreadCheckpoints(null));
    await act(async () => {});
    expect(result.current.checkpoints).toEqual([]);
    // list must not be called for null threadId (clearAllMocks in beforeEach ensures
    // no carry-over from prior tests)
    expect(mockApi.checkpoint.list).not.toHaveBeenCalled();
  });

  it('re-fetches when onChange fires for the same thread', async () => {
    renderHook(() => useThreadCheckpoints('thread-abc'));
    await act(async () => {});
    const callsBefore = mockApi.checkpoint.list.mock.calls.length;

    await act(async () => {
      onChangeCb?.('thread-abc');
    });
    expect(mockApi.checkpoint.list.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('does not re-fetch when onChange fires for a different thread', async () => {
    renderHook(() => useThreadCheckpoints('thread-abc'));
    await act(async () => {});
    const callsBefore = mockApi.checkpoint.list.mock.calls.length;

    await act(async () => {
      onChangeCb?.('thread-OTHER');
    });
    expect(mockApi.checkpoint.list.mock.calls.length).toBe(callsBefore);
  });

  it('exposes a refresh function that re-fetches', async () => {
    const { result } = renderHook(() => useThreadCheckpoints('thread-abc'));
    await act(async () => {});
    const callsBefore = mockApi.checkpoint.list.mock.calls.length;

    await act(async () => {
      result.current.refresh();
    });
    expect(mockApi.checkpoint.list.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('handles list failure gracefully (empty array)', async () => {
    mockApi.checkpoint.list.mockRejectedValueOnce(new Error('ipc error'));
    const { result } = renderHook(() => useThreadCheckpoints('thread-abc'));
    await act(async () => {});
    expect(result.current.checkpoints).toEqual([]);
  });
});
