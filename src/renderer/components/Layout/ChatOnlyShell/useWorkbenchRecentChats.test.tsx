/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';
import { useWorkbenchRecentChats } from './useWorkbenchRecentChats';

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
    status: 'complete',
    messages: [],
    ...overrides,
  };
}

describe('useWorkbenchRecentChats', () => {
  it('dedupes repeated thread ids and excludes chats already linked to sessions', () => {
    const { result } = renderHook(() =>
      useWorkbenchRecentChats({
        sessions: [makeSession({ conversationThreadId: 'thread-linked' })],
        threads: [
          makeThread({ id: 'thread-a', updatedAt: 20, title: 'Newest thread-a' }),
          makeThread({ id: 'thread-a', updatedAt: 10, title: 'Older thread-a' }),
          makeThread({ id: 'thread-linked', updatedAt: 30, title: 'Linked thread' }),
        ],
      }),
    );

    expect(result.current.items.map((item) => item.id)).toEqual(['thread-a']);
    expect(result.current.items[0]?.title).toBe('Newest thread-a');
  });

  it('orders active, pinned, and higher-attention chats ahead of stale chats', () => {
    const { result } = renderHook(() =>
      useWorkbenchRecentChats({
        activeThreadId: 'thread-active',
        threads: [
          makeThread({ id: 'thread-stale', updatedAt: 5 }),
          makeThread({ id: 'thread-pinned', updatedAt: 8, pinned: true }),
          makeThread({ id: 'thread-alert', updatedAt: 7 }),
          makeThread({ id: 'thread-active', updatedAt: 6 }),
        ],
        attentionByThreadId: {
          'thread-alert': {
            kind: 'failed',
            label: 'Failure',
            rank: 4,
            tone: 'error',
            isSticky: true,
          },
        },
      }),
    );

    expect(result.current.items.map((item) => item.id)).toEqual([
      'thread-active',
      'thread-pinned',
      'thread-alert',
      'thread-stale',
    ]);
  });
});
