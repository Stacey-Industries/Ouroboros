/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  AgentChatThreadRecord,
  ApprovalRequest,
  SessionRecord,
} from '../../../types/electron';
import { useWorkbenchAttention } from './useWorkbenchAttention';

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

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'approval-1',
    sessionId: 'session-1',
    toolName: 'shell_command',
    toolInput: {},
    timestamp: 10,
    ...overrides,
  };
}

describe('useWorkbenchAttention', () => {
  it('prefers approval attention over live state when approval data is present', () => {
    const { result } = renderHook(() =>
      useWorkbenchAttention({
        sessions: [makeSession()],
        threads: [makeThread()],
        approvalRequests: [makeApproval()],
      }),
    );

    expect(result.current.sessionAttentionById['session-1']).toMatchObject({
      kind: 'approval',
      label: 'Approval',
      isSticky: true,
    });
    expect(result.current.chatAttentionById['thread-1']).toMatchObject({
      kind: 'approval',
      label: 'Approval',
    });
  });

  it('marks failures explicitly when the linked thread failed', () => {
    const { result } = renderHook(() =>
      useWorkbenchAttention({
        sessions: [makeSession()],
        threads: [makeThread({ status: 'failed' })],
      }),
    );

    expect(result.current.sessionAttentionById['session-1']).toMatchObject({
      kind: 'failed',
      label: 'Failure',
    });
  });

  it('tracks unseen completion conservatively from busy to complete transitions', () => {
    const session = makeSession();
    const { result, rerender } = renderHook(
      ({
        threads,
        activeSessionId,
      }: {
        threads: AgentChatThreadRecord[];
        activeSessionId: string | null;
      }) =>
        useWorkbenchAttention({
          sessions: [session],
          threads,
          activeSessionId,
        }),
      {
        initialProps: {
          activeSessionId: null,
          threads: [makeThread({ status: 'running', updatedAt: 10 })],
        },
      },
    );

    expect(result.current.sessionAttentionById['session-1'].kind).toBe('live');

    rerender({
      activeSessionId: null,
      threads: [makeThread({ status: 'complete', updatedAt: 11 })],
    });

    expect(result.current.sessionAttentionById['session-1']).toMatchObject({
      kind: 'completed-unseen',
      label: 'Completed',
      isSticky: true,
    });

    rerender({
      activeSessionId: 'session-1',
      threads: [makeThread({ status: 'complete', updatedAt: 11 })],
    });

    expect(result.current.sessionAttentionById['session-1'].kind).toBe('none');
  });
});
