/**
 * useSessions.test.ts — Unit tests for the useSessions hook.
 *
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '../../types/electron';
import { useSessions } from './useSessions';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(id: string, projectRoot = '/projects/test'): SessionRecord {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    projectRoot,
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
  };
}

// ─── electronAPI mock ─────────────────────────────────────────────────────────

let onChangedCleanup = vi.fn();
let onChangedCallback: ((sessions: SessionRecord[]) => void) | null = null;

const mockSessionCrud = {
  list: vi.fn(),
  active: vi.fn(),
  onChanged: vi.fn((cb: (sessions: SessionRecord[]) => void) => {
    onChangedCallback = cb;
    return onChangedCleanup;
  }),
};

beforeEach(() => {
  onChangedCallback = null;
  onChangedCleanup = vi.fn();

  mockSessionCrud.list.mockResolvedValue({ success: true, sessions: [] });
  mockSessionCrud.active.mockResolvedValue({ success: true, sessionId: null });
  mockSessionCrud.onChanged.mockImplementation((cb: (sessions: SessionRecord[]) => void) => {
    onChangedCallback = cb;
    return onChangedCleanup;
  });

  Object.defineProperty(window, 'electronAPI', {
    value: { sessionCrud: mockSessionCrud },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSessions', () => {
  it('starts with isLoading true and empty sessions', () => {
    // Make list hang so we can observe the loading state.
    mockSessionCrud.list.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useSessions());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.sessions).toEqual([]);
  });

  it('populates sessions after load resolves', async () => {
    const s = makeSession('abc-123');
    mockSessionCrud.list.mockResolvedValue({ success: true, sessions: [s] });
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('abc-123');
  });

  it('sets activeSessionId from sessionCrud:active', async () => {
    mockSessionCrud.active.mockResolvedValue({ success: true, sessionId: 'active-id' });
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeSessionId).toBe('active-id');
  });

  it('activeSessionId is null when active returns null', async () => {
    mockSessionCrud.active.mockResolvedValue({ success: true, sessionId: null });
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeSessionId).toBeNull();
  });

  it('live-updates sessions when onChanged fires', async () => {
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updated = [makeSession('live-1'), makeSession('live-2')];
    act(() => { onChangedCallback?.(updated); });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[0].id).toBe('live-1');
  });

  it('calls onChanged cleanup on unmount', async () => {
    const { unmount } = renderHook(() => useSessions());
    await waitFor(() => expect(mockSessionCrud.onChanged).toHaveBeenCalled());
    unmount();
    expect(onChangedCleanup).toHaveBeenCalledOnce();
  });

  it('refresh triggers a new list + active fetch', async () => {
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBefore = mockSessionCrud.list.mock.calls.length;
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(mockSessionCrud.list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('returns empty sessions when list result is not success', async () => {
    mockSessionCrud.list.mockResolvedValue({ success: false, error: 'store not ready' });
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions).toEqual([]);
  });

  it('returns empty sessions when electronAPI is absent', async () => {
    // Delete the property entirely so 'electronAPI' in window is false.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electronAPI;
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
  });
});
