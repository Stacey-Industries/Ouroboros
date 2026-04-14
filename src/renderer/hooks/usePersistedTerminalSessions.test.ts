/**
 * @vitest-environment jsdom
 *
 * usePersistedTerminalSessions — smoke tests
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedSessionInfo } from '../types/electron';
import { usePersistedTerminalSessions } from './usePersistedTerminalSessions';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function makeSession(overrides: Partial<PersistedSessionInfo> = {}): PersistedSessionInfo {
  return {
    id: 'session-1',
    cwd: '/home/user/project',
    shellPath: '/bin/zsh',
    cols: 80,
    rows: 24,
    createdAt: Date.now() - 1000,
    lastSeenAt: Date.now() - 1000,
    ...overrides,
  };
}

function setupElectronAPI(sessions: PersistedSessionInfo[]): {
  listPersistedSessions: ReturnType<typeof vi.fn>;
  restoreSession: ReturnType<typeof vi.fn>;
  discardPersistedSessions: ReturnType<typeof vi.fn>;
} {
  const listPersistedSessions = vi.fn().mockResolvedValue(sessions);
  const restoreSession = vi.fn().mockResolvedValue({ success: true });
  const discardPersistedSessions = vi.fn().mockResolvedValue({ success: true });

  Object.defineProperty(window, 'electronAPI', {
    value: { pty: { listPersistedSessions, restoreSession, discardPersistedSessions } },
    writable: true,
    configurable: true,
  });

  return { listPersistedSessions, restoreSession, discardPersistedSessions };
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePersistedTerminalSessions', () => {
  it('starts in loading state', () => {
    setupElectronAPI([]);
    const { result } = renderHook(() => usePersistedTerminalSessions());
    expect(result.current.isLoading).toBe(true);
  });

  it('returns sessions after load', async () => {
    const session = makeSession();
    setupElectronAPI([session]);

    const { result } = renderHook(() => usePersistedTerminalSessions());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('session-1');
  });

  it('filters out sessions older than 7 days and discards all', async () => {
    const stale = makeSession({ id: 'stale', lastSeenAt: Date.now() - SEVEN_DAYS_MS - 1000 });
    const fresh = makeSession({ id: 'fresh', lastSeenAt: Date.now() - 1000 });
    const { discardPersistedSessions } = setupElectronAPI([stale, fresh]);

    const { result } = renderHook(() => usePersistedTerminalSessions());

    await act(async () => {
      await Promise.resolve();
    });

    // Stale session causes a full discard and empty sessions list
    expect(discardPersistedSessions).toHaveBeenCalled();
    expect(result.current.sessions).toHaveLength(0);
  });

  it('restore() calls restoreSession and removes the session from state', async () => {
    const s1 = makeSession({ id: 'a' });
    const s2 = makeSession({ id: 'b' });
    const { restoreSession } = setupElectronAPI([s1, s2]);

    const { result } = renderHook(() => usePersistedTerminalSessions());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.restore('a');
    });

    expect(restoreSession).toHaveBeenCalledWith('a');
    expect(result.current.sessions.map((s) => s.id)).toEqual(['b']);
  });

  it('restoreAll() restores every session and clears state', async () => {
    const s1 = makeSession({ id: 'a' });
    const s2 = makeSession({ id: 'b' });
    const { restoreSession } = setupElectronAPI([s1, s2]);

    const { result } = renderHook(() => usePersistedTerminalSessions());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.restoreAll();
    });

    expect(restoreSession).toHaveBeenCalledTimes(2);
    expect(result.current.sessions).toHaveLength(0);
  });

  it('discardAll() calls discardPersistedSessions and clears state', async () => {
    const session = makeSession();
    const { discardPersistedSessions } = setupElectronAPI([session]);

    const { result } = renderHook(() => usePersistedTerminalSessions());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.discardAll();
    });

    expect(discardPersistedSessions).toHaveBeenCalled();
    expect(result.current.sessions).toHaveLength(0);
  });

  it('handles IPC failure gracefully', async () => {
    const listPersistedSessions = vi.fn().mockRejectedValue(new Error('IPC error'));
    Object.defineProperty(window, 'electronAPI', {
      value: { pty: { listPersistedSessions } },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => usePersistedTerminalSessions());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.sessions).toHaveLength(0);
  });
});
