/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';
import { useWorkbenchSessionActivation } from './useWorkbenchSessionActivation';

const mockActivate = vi.fn();

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    createdAt: '2026-04-22T12:00:00.000Z',
    lastUsedAt: '2026-04-22T12:00:00.000Z',
    projectRoot: '/workspace/alpha',
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: 'session-1' },
    ...overrides,
  };
}

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/workspace/alpha',
    createdAt: 1_000,
    updatedAt: 2_000,
    title: 'Alpha',
    status: 'idle',
    messages: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockActivate.mockResolvedValue({ success: true });

  Object.defineProperty(window, 'electronAPI', {
    value: {
      sessionCrud: { activate: mockActivate },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useWorkbenchSessionActivation', () => {
  it('activates the session and refreshes session state on success', async () => {
    const refreshSessions = vi.fn();
    const selectThread = vi.fn();
    const { result } = renderHook(() =>
      useWorkbenchSessionActivation({
        sessions: [makeSession({ conversationThreadId: 'thread-1' })],
        threads: [makeThread()],
        refreshSessions,
        actions: { selectThread },
      }),
    );

    let activated = false;
    await act(async () => {
      activated = await result.current.activateSession('session-1');
    });

    expect(activated).toBe(true);
    expect(mockActivate).toHaveBeenCalledWith('session-1');
    expect(refreshSessions).toHaveBeenCalledOnce();
    expect(selectThread).toHaveBeenCalledWith('thread-1');
    expect(result.current.activatingSessionId).toBeNull();
  });

  it('does not refresh sessions when activation fails', async () => {
    mockActivate.mockResolvedValue({ success: false, error: 'failed' });
    const refreshSessions = vi.fn();
    const selectThread = vi.fn();
    const { result } = renderHook(() =>
      useWorkbenchSessionActivation({
        sessions: [makeSession()],
        threads: [makeThread()],
        refreshSessions,
        actions: { selectThread },
      }),
    );

    let activated = true;
    await act(async () => {
      activated = await result.current.activateSession('session-1');
    });

    expect(activated).toBe(false);
    expect(refreshSessions).not.toHaveBeenCalled();
    expect(selectThread).not.toHaveBeenCalled();
  });

  it('returns false without electronAPI and does not crash', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const refreshSessions = vi.fn();
    const selectThread = vi.fn();
    const { result } = renderHook(() =>
      useWorkbenchSessionActivation({
        sessions: [makeSession()],
        threads: [makeThread()],
        refreshSessions,
        actions: { selectThread },
      }),
    );

    let activated = true;
    await act(async () => {
      activated = await result.current.activateSession('session-1');
    });

    expect(activated).toBe(false);
    expect(mockActivate).not.toHaveBeenCalled();
    expect(refreshSessions).not.toHaveBeenCalled();
    expect(selectThread).not.toHaveBeenCalled();
  });

  it('prefers conversationThreadId over a newer thread in the same workspace', async () => {
    const selectThread = vi.fn();
    const { result } = renderHook(() =>
      useWorkbenchSessionActivation({
        sessions: [makeSession({ conversationThreadId: 'thread-linked' })],
        threads: [
          makeThread({ id: 'thread-newer', updatedAt: 9_000 }),
          makeThread({ id: 'thread-linked', updatedAt: 1_000 }),
        ],
        refreshSessions: vi.fn(),
        actions: { selectThread },
      }),
    );

    await act(async () => {
      await result.current.activateSession('session-1');
    });

    expect(selectThread).toHaveBeenCalledWith('thread-linked');
  });

  it('falls back to the most recently updated thread in the same workspace root', async () => {
    const selectThread = vi.fn();
    const { result } = renderHook(() =>
      useWorkbenchSessionActivation({
        sessions: [makeSession()],
        threads: [
          makeThread({
            id: 'thread-other-root',
            workspaceRoot: '/workspace/beta',
            updatedAt: 99_000,
          }),
          makeThread({ id: 'thread-older', updatedAt: 1_000 }),
          makeThread({ id: 'thread-latest', updatedAt: 5_000 }),
        ],
        refreshSessions: vi.fn(),
        actions: { selectThread },
      }),
    );

    await act(async () => {
      await result.current.activateSession('session-1');
    });

    expect(selectThread).toHaveBeenCalledWith('thread-latest');
  });
});
