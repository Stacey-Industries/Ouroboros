/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock agentChatStore before module import
vi.mock('../../AgentChat/agentChatStore', () => {
  const state = {
    threads: [],
    activeThread: null,
    onSelectThread: vi.fn(),
  };
  const store = {
    getState: () => state,
    setState: vi.fn((fn: (s: typeof state) => typeof state) => {
      Object.assign(state, fn(state));
    }),
    subscribe: vi.fn(() => vi.fn()),
  };
  return {
    AgentChatStoreContext: { _currentValue: store },
    useAgentChatStoreContext: (selector: (s: typeof state) => unknown) => selector(state),
  };
});

import { useWorkbenchRailActions } from './useWorkbenchRailActions';

const mockDeleteThread = vi.fn().mockResolvedValue({ success: true });
const mockPinThread = vi.fn().mockResolvedValue({ success: true });
const mockListThreads = vi.fn().mockResolvedValue({ success: true, threads: [] });
const mockDeleteSession = vi.fn().mockResolvedValue({ success: true });
const mockArchiveSession = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      agentChat: {
        deleteThread: mockDeleteThread,
        pinThread: mockPinThread,
        listThreads: mockListThreads,
      },
      sessionCrud: {
        delete: mockDeleteSession,
        archive: mockArchiveSession,
      },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useWorkbenchRailActions', () => {
  it('returns actions object with all five handlers', () => {
    const { result } = renderHook(() => useWorkbenchRailActions());
    expect(typeof result.current.actions.onDeleteSession).toBe('function');
    expect(typeof result.current.actions.onArchiveSession).toBe('function');
    expect(typeof result.current.actions.onDeleteThread).toBe('function');
    expect(typeof result.current.actions.onPinThread).toBe('function');
    expect(typeof result.current.actions.onRenameThread).toBe('function');
  });

  it('onDeleteSession calls sessionCrud.delete', async () => {
    const { result } = renderHook(() => useWorkbenchRailActions());
    await act(async () => {
      await result.current.actions.onDeleteSession('sess-1');
    });
    expect(mockDeleteSession).toHaveBeenCalledWith('sess-1');
  });

  it('onArchiveSession calls sessionCrud.archive', async () => {
    const { result } = renderHook(() => useWorkbenchRailActions());
    await act(async () => {
      await result.current.actions.onArchiveSession('sess-2');
    });
    expect(mockArchiveSession).toHaveBeenCalledWith('sess-2');
  });

  it('onDeleteThread calls agentChat.deleteThread', async () => {
    const { result } = renderHook(() => useWorkbenchRailActions());
    await act(async () => {
      await result.current.actions.onDeleteThread('thread-1');
    });
    expect(mockDeleteThread).toHaveBeenCalledWith('thread-1');
  });

  it('onPinThread calls agentChat.pinThread', async () => {
    const { result } = renderHook(() => useWorkbenchRailActions());
    await act(async () => {
      await result.current.actions.onPinThread('thread-2', true);
    });
    expect(mockPinThread).toHaveBeenCalledWith('thread-2', true);
  });

  it('onRenameThread sets renameTarget', () => {
    const { result } = renderHook(() => useWorkbenchRailActions());
    const thread = {
      id: 'thread-3',
      title: 'Test',
      version: 1,
      workspaceRoot: '/ws',
      createdAt: 1,
      updatedAt: 2,
      status: 'idle' as const,
      messages: [],
      pinned: false,
    };
    act(() => {
      result.current.actions.onRenameThread(thread);
    });
    expect(result.current.renameTarget).toEqual(thread);
  });

  it('setRenameTarget clears renameTarget', () => {
    const { result } = renderHook(() => useWorkbenchRailActions());
    const thread = {
      id: 'thread-4',
      title: 'Test',
      version: 1,
      workspaceRoot: '/ws',
      createdAt: 1,
      updatedAt: 2,
      status: 'idle' as const,
      messages: [],
      pinned: false,
    };
    act(() => {
      result.current.actions.onRenameThread(thread);
    });
    act(() => {
      result.current.setRenameTarget(null);
    });
    expect(result.current.renameTarget).toBeNull();
  });
});
