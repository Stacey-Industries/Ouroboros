/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
import type { SessionRecord, AgentChatThreadRecord } from '../../../types/electron';
import { useWorkbenchSessions } from './useWorkbenchSessions';

vi.mock('../../SessionSidebar/useSessions', () => ({
  useSessions: () => ({
    sessions: [],
    activeSessionId: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-04-22T14:00:00.000Z',
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
    createdAt: Date.now() - 5_000,
    updatedAt: Date.now() - 1_000,
    title: 'Alpha thread',
    status: 'running',
    messages: [],
    ...overrides,
  };
}

describe('useWorkbenchSessions', () => {
  it('sorts active and pinned sessions ahead of the rest', () => {
    const sessions = [
      makeSession({ id: 'older', projectRoot: '/workspace/older', lastUsedAt: '2026-04-21T12:00:00.000Z' }),
      makeSession({ id: 'pinned', projectRoot: '/workspace/pinned', pinned: true, lastUsedAt: '2026-04-20T12:00:00.000Z' }),
      makeSession({ id: 'active', projectRoot: '/workspace/active', lastUsedAt: '2026-04-19T12:00:00.000Z' }),
    ];

    const { result } = renderHook(() => useWorkbenchSessions({
      sessions,
      activeSessionId: 'active',
      now: new Date('2026-04-22T15:00:00.000Z').getTime(),
    }));

    expect(result.current.items.map((item) => item.id)).toEqual(['active', 'pinned', 'older']);
  });

  it('derives chat and terminal counts from supplied data', () => {
    const { result } = renderHook(() => useWorkbenchSessions({
      sessions: [
        makeSession({
          id: 'session-a',
          projectRoot: '/workspace/alpha',
          activeTerminalIds: ['term-a', 'term-b'],
        }),
      ],
      threads: [
        makeThread({ id: 'thread-a' }),
        makeThread({ id: 'thread-b' }),
      ],
      terminalSessions: [
        { id: 'term-a', title: 'Terminal A', status: 'running' },
      ],
    }));

    expect(result.current.items[0]).toMatchObject({
      terminalCount: 2,
      chatCount: 2,
      hasConversation: true,
    });
  });

  it('reads optional chat-store context when overrides are not provided', () => {
    const store = createAgentChatStore();
    store.setState((state) => ({
      ...state,
      threads: [makeThread({ id: 'thread-live' })],
      activeThread: makeThread({ id: 'thread-live' }),
    }));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AgentChatStoreContext.Provider value={store}>{children}</AgentChatStoreContext.Provider>
    );

    const { result } = renderHook(() => useWorkbenchSessions({
      sessions: [
        makeSession({ id: 'session-a', projectRoot: '/workspace/alpha', conversationThreadId: 'thread-live' }),
      ],
    }), { wrapper });

    expect(result.current.items[0]).toMatchObject({
      chatCount: 1,
      hasActiveThread: true,
    });
  });

  it('marks archived and deleted sessions with the expected status', () => {
    const { result } = renderHook(() => useWorkbenchSessions({
      sessions: [
        makeSession({ id: 'archived', archivedAt: '2026-04-21T00:00:00.000Z' }),
        makeSession({ id: 'deleted', deletedAt: Date.now() - 10_000 }),
      ],
    }));

    expect(result.current.items.find((item) => item.id === 'archived')?.status).toBe('archived');
    expect(result.current.items.find((item) => item.id === 'deleted')?.status).toBe('deleted');
  });
});
