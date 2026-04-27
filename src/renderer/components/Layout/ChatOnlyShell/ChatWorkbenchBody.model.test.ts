/**
 * @vitest-environment jsdom
 *
 * Tests for ChatWorkbenchBody.model — useWorkbenchHandlers and
 * useActiveApprovalSessionIds. useWorkbenchContextState composes too many
 * external providers to test in isolation here; it is covered by the
 * ChatWorkbenchFollowThrough integration test.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useActiveApprovalSessionIds, useWorkbenchHandlers } from './ChatWorkbenchBody.model';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../AgentChat/agentChatStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../AgentChat/agentChatStore')>();
  return {
    ...actual,
    useAgentChatStoreContext: vi.fn((selector: (s: unknown) => unknown) => {
      const store = {
        threads: [],
        activeThread: mockActiveThread,
        onSelectThread: vi.fn(),
      };
      return selector(store);
    }),
  };
});

vi.mock('../../SessionSidebar/NewSessionButton', () => ({
  createStoredSessionFromPicker: vi.fn(),
}));

import { useAgentChatStoreContext } from '../../AgentChat/agentChatStore';
import { createStoredSessionFromPicker } from '../../SessionSidebar/NewSessionButton';

const mockCreateStoredSessionFromPicker = vi.mocked(createStoredSessionFromPicker);
const mockUseAgentChatStoreContext = vi.mocked(useAgentChatStoreContext);

let mockActiveThread: {
  latestOrchestration?: {
    sessionId?: string;
    claudeSessionId?: string;
    codexThreadId?: string;
  };
} | null = null;

// ── useWorkbenchHandlers ──────────────────────────────────────────────────────

describe('useWorkbenchHandlers', () => {
  const mockActivation = {
    activateSession: vi.fn().mockResolvedValue(undefined),
  };
  const mockSelectThread = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockActivation.activateSession.mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = undefined;
  });

  it('handleLaunchAgent dispatches OPEN_MULTI_SESSION_EVENT on window', () => {
    const { result } = renderHook(() =>
      useWorkbenchHandlers(mockActivation as never, mockSelectThread),
    );
    const spy = vi.spyOn(window, 'dispatchEvent');
    act(() => {
      result.current.handleLaunchAgent();
    });
    expect(spy).toHaveBeenCalledOnce();
    const event = spy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('agent-ide:open-multi-session');
    spy.mockRestore();
  });

  it('handleSelectSession calls activation.activateSession with the given sessionId', () => {
    const { result } = renderHook(() =>
      useWorkbenchHandlers(mockActivation as never, mockSelectThread),
    );
    act(() => {
      result.current.handleSelectSession('ses-123');
    });
    expect(mockActivation.activateSession).toHaveBeenCalledWith('ses-123');
  });

  it('handleSelectRecentChat calls selectThread with the given threadId', () => {
    const { result } = renderHook(() =>
      useWorkbenchHandlers(mockActivation as never, mockSelectThread),
    );
    act(() => {
      result.current.handleSelectRecentChat('thread-abc');
    });
    expect(mockSelectThread).toHaveBeenCalledWith('thread-abc');
  });

  it('handleCreateSession aborts when createStoredSessionFromPicker returns null', async () => {
    mockCreateStoredSessionFromPicker.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useWorkbenchHandlers(mockActivation as never, mockSelectThread),
    );
    await act(async () => {
      await result.current.handleCreateSession();
    });
    expect(mockActivation.activateSession).not.toHaveBeenCalled();
    expect(mockSelectThread).not.toHaveBeenCalled();
  });

  it('handleCreateSession creates thread then activates session and navigates to it', async () => {
    const fakeSession = { id: 'ses-new', projectRoot: '/projects/new' };
    mockCreateStoredSessionFromPicker.mockResolvedValue(fakeSession as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = {
      agentChat: {
        createThread: vi.fn().mockResolvedValue({ success: true, thread: { id: 'thread-new' } }),
      },
    };

    const { result } = renderHook(() =>
      useWorkbenchHandlers(mockActivation as never, mockSelectThread),
    );

    await act(async () => {
      await result.current.handleCreateSession();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).electronAPI.agentChat.createThread).toHaveBeenCalledWith({
      workspaceRoot: '/projects/new',
    });
    expect(mockActivation.activateSession).toHaveBeenCalledWith('ses-new');
    // selectThread called with the newly-created thread id (non-null)
    expect(mockSelectThread).toHaveBeenCalledWith('thread-new');
  });
});

// ── useActiveApprovalSessionIds ───────────────────────────────────────────────

describe('useActiveApprovalSessionIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveThread = null;
  });

  it('returns array with activeSessionId and nulls when no active thread', () => {
    mockUseAgentChatStoreContext.mockImplementation((selector: (s: unknown) => unknown) => {
      return selector({ threads: [], activeThread: null, onSelectThread: vi.fn() });
    });
    const { result } = renderHook(() => useActiveApprovalSessionIds('ses-1'));
    expect(result.current[0]).toBe('ses-1');
    expect(result.current[1]).toBeUndefined();
    expect(result.current[2]).toBeUndefined();
    expect(result.current[3]).toBeUndefined();
  });

  it('includes orchestration session IDs when active thread has orchestration', () => {
    mockUseAgentChatStoreContext.mockImplementation((selector: (s: unknown) => unknown) => {
      return selector({
        threads: [],
        activeThread: {
          latestOrchestration: {
            sessionId: 'orch-ses',
            claudeSessionId: 'claude-ses',
            codexThreadId: 'codex-t',
          },
        },
        onSelectThread: vi.fn(),
      });
    });
    const { result } = renderHook(() => useActiveApprovalSessionIds('ses-1'));
    expect(result.current).toEqual(['ses-1', 'orch-ses', 'claude-ses', 'codex-t']);
  });
});
