/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  describe('snoozeSession', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('suppresses non-sticky attention while snooze is active and restores it after expiry', () => {
      const session = makeSession();
      const { result, rerender } = renderHook(
        ({ threads }: { threads: AgentChatThreadRecord[] }) =>
          useWorkbenchAttention({ sessions: [session], threads }),
        {
          initialProps: {
            threads: [makeThread({ status: 'running', updatedAt: 10 })],
          },
        },
      );

      // Transition to completed-unseen
      rerender({ threads: [makeThread({ status: 'complete', updatedAt: 11 })] });
      expect(result.current.sessionAttentionById['session-1'].kind).toBe('completed-unseen');

      // Snooze for 5 seconds; the next computation suppresses it
      act(() => {
        result.current.snoozeSession('session-1', 5_000);
      });
      rerender({ threads: [makeThread({ status: 'complete', updatedAt: 11 })] });
      expect(result.current.sessionAttentionById['session-1'].kind).toBe('none');

      // Advance past snooze expiry; attention should be restored on next rerender
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      rerender({ threads: [makeThread({ status: 'complete', updatedAt: 11 })] });
      expect(result.current.sessionAttentionById['session-1'].kind).toBe('completed-unseen');
    });

    it('does not snooze sticky terminal states (failed, needs_review)', () => {
      const session = makeSession();
      const { result, rerender } = renderHook(
        ({ threads }: { threads: AgentChatThreadRecord[] }) =>
          useWorkbenchAttention({ sessions: [session], threads }),
        {
          initialProps: {
            threads: [makeThread({ status: 'failed' })],
          },
        },
      );

      expect(result.current.sessionAttentionById['session-1'].kind).toBe('failed');

      act(() => {
        result.current.snoozeSession('session-1', 60_000);
      });

      // Rerender with same data; snooze must NOT suppress 'failed'
      rerender({ threads: [makeThread({ status: 'failed' })] });
      expect(result.current.sessionAttentionById['session-1'].kind).toBe('failed');

      // Also verify needs_review is immune
      rerender({ threads: [makeThread({ status: 'needs_review' })] });
      expect(result.current.sessionAttentionById['session-1'].kind).toBe('review');
    });

    it('snooze is session-scoped and does not suppress other sessions', () => {
      const session1 = makeSession({ id: 'session-1' });
      const session2 = makeSession({ id: 'session-2' });
      const thread1 = makeThread({
        id: 'thread-1',
        status: 'complete',
        updatedAt: 11,
        latestOrchestration: { sessionId: 'session-1' },
      });
      const thread2 = makeThread({
        id: 'thread-2',
        status: 'complete',
        updatedAt: 11,
        latestOrchestration: { sessionId: 'session-2' },
      });

      const { result, rerender } = renderHook(
        ({ threads }: { threads: AgentChatThreadRecord[] }) =>
          useWorkbenchAttention({
            sessions: [session1, session2],
            threads,
          }),
        {
          initialProps: {
            threads: [
              makeThread({
                status: 'running',
                updatedAt: 10,
                latestOrchestration: { sessionId: 'session-1' },
              }),
              makeThread({
                id: 'thread-2',
                status: 'running',
                updatedAt: 10,
                latestOrchestration: { sessionId: 'session-2' },
              }),
            ],
          },
        },
      );

      // Move both sessions to completed-unseen
      rerender({ threads: [thread1, thread2] });
      expect(result.current.sessionAttentionById['session-1'].kind).toBe('completed-unseen');
      expect(result.current.sessionAttentionById['session-2'].kind).toBe('completed-unseen');

      // Snooze only session-1
      act(() => {
        result.current.snoozeSession('session-1', 5_000);
      });
      rerender({ threads: [thread1, thread2] });

      expect(result.current.sessionAttentionById['session-1'].kind).toBe('none');
      expect(result.current.sessionAttentionById['session-2'].kind).toBe('completed-unseen');
    });
  });
});
