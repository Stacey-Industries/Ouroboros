/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';
import { AgentChatStoreContext, createAgentChatStore } from '../../AgentChat/agentChatStore';
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
    createdAt: 1,
    updatedAt: 10,
    title: 'Alpha thread',
    status: 'running',
    messages: [],
    latestOrchestration: { sessionId: 'session-1' },
    ...overrides,
  };
}

describe('useWorkbenchSessions', () => {
  it('splits the active session from background sessions and orders background items', () => {
    const { result } = renderHook(() =>
      useWorkbenchSessions({
        sessions: [
          makeSession({
            id: 'older',
            projectRoot: '/workspace/older',
            lastUsedAt: '2026-04-21T12:00:00.000Z',
          }),
          makeSession({
            id: 'pinned',
            projectRoot: '/workspace/pinned',
            pinned: true,
            lastUsedAt: '2026-04-20T12:00:00.000Z',
          }),
          makeSession({
            id: 'alert',
            projectRoot: '/workspace/alert',
            lastUsedAt: '2026-04-19T12:00:00.000Z',
          }),
          makeSession({
            id: 'active',
            projectRoot: '/workspace/active',
            lastUsedAt: '2026-04-18T12:00:00.000Z',
          }),
        ],
        activeSessionId: 'active',
        attentionBySessionId: {
          alert: {
            kind: 'failed',
            label: 'Failure',
            rank: 4,
            tone: 'error',
            isSticky: true,
          },
        },
      }),
    );

    expect(result.current.activeItems.map((item) => item.id)).toEqual(['active']);
    expect(result.current.backgroundItems.map((item) => item.id)).toEqual([
      'pinned',
      'alert',
      'older',
    ]);
    expect(result.current.items.map((item) => item.id)).toEqual([
      'active',
      'pinned',
      'alert',
      'older',
    ]);
  });

  it('dedupes repeated session ids and keeps the newest session record', () => {
    const { result } = renderHook(() =>
      useWorkbenchSessions({
        sessions: [
          makeSession({ id: 'dup', lastUsedAt: '2026-04-21T12:00:00.000Z' }),
          makeSession({ id: 'dup', lastUsedAt: '2026-04-22T12:00:00.000Z', pinned: true }),
        ],
      }),
    );

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      id: 'dup',
      isPinned: true,
    });
  });

  it('derives terminal and chat counts and attaches linked thread attention', () => {
    const { result } = renderHook(() =>
      useWorkbenchSessions({
        sessions: [
          makeSession({
            id: 'session-a',
            projectRoot: '/workspace/alpha',
            activeTerminalIds: ['term-a', 'term-b'],
          }),
        ],
        threads: [
          makeThread({ id: 'thread-a', latestOrchestration: { sessionId: 'session-a' } }),
          makeThread({ id: 'thread-b', latestOrchestration: { sessionId: 'session-a' } }),
        ],
        terminalSessions: [{ id: 'term-a', title: 'Terminal A', status: 'running' }],
        attentionBySessionId: {
          'session-a': {
            kind: 'approval',
            label: 'Approval',
            rank: 5,
            tone: 'warning',
            isSticky: true,
          },
        },
      }),
    );

    expect(result.current.items[0]).toMatchObject({
      terminalCount: 2,
      chatCount: 2,
      hasConversation: true,
      attention: { kind: 'approval' },
      threadStatus: 'running',
      linkedThreadId: 'thread-a',
    });
  });

  it('reads chat-store thread state when thread overrides are not provided', () => {
    const store = createAgentChatStore();
    store.setState((state) => ({
      ...state,
      threads: [makeThread({ id: 'thread-live' })],
      activeThread: makeThread({ id: 'thread-live' }),
    }));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AgentChatStoreContext.Provider value={store}>{children}</AgentChatStoreContext.Provider>
    );

    const { result } = renderHook(
      () =>
        useWorkbenchSessions({
          sessions: [
            makeSession({
              id: 'session-a',
              projectRoot: '/workspace/alpha',
              conversationThreadId: 'thread-live',
            }),
          ],
        }),
      { wrapper },
    );

    expect(result.current.items[0]).toMatchObject({
      chatCount: 1,
      hasActiveThread: true,
      linkedThreadId: 'thread-live',
    });
  });

  it('keeps archived and deleted sessions in the background section with explicit status', () => {
    const { result } = renderHook(() =>
      useWorkbenchSessions({
        sessions: [
          makeSession({ id: 'active' }),
          makeSession({ id: 'archived', archivedAt: '2026-04-21T00:00:00.000Z' }),
          makeSession({ id: 'deleted', deletedAt: Date.now() - 10_000 }),
        ],
        activeSessionId: 'active',
      }),
    );

    expect(result.current.backgroundItems.map((item) => item.status)).toEqual([
      'archived',
      'deleted',
    ]);
  });
});
