/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import type { AgentChatThreadRecord } from '../../../types/electron';
import {
  applySnooze,
  buildApprovalCounts,
  buildSessionThreadIndex,
  buildTargetMap,
  deriveAttention,
  NONE_ATTENTION,
  SNOOZEABLE_KINDS,
  updateCacheEntry,
} from './useWorkbenchAttention.helpers';

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/workspace/alpha',
    createdAt: 1,
    updatedAt: 10,
    title: 'Test thread',
    status: 'running',
    messages: [],
    latestOrchestration: { sessionId: 'session-1' },
    ...overrides,
  };
}

describe('buildApprovalCounts', () => {
  it('counts approvals per session', () => {
    const counts = buildApprovalCounts([
      { requestId: 'a', sessionId: 'session-1', toolName: 'x', toolInput: {}, timestamp: 1 },
      { requestId: 'b', sessionId: 'session-1', toolName: 'x', toolInput: {}, timestamp: 2 },
      { requestId: 'c', sessionId: 'session-2', toolName: 'x', toolInput: {}, timestamp: 3 },
    ]);
    expect(counts.get('session-1')).toBe(2);
    expect(counts.get('session-2')).toBe(1);
  });
});

describe('buildSessionThreadIndex', () => {
  it('groups threads by session ID and sorts by updatedAt descending', () => {
    const t1 = makeThread({ id: 't1', updatedAt: 5, latestOrchestration: { sessionId: 's1' } });
    const t2 = makeThread({ id: 't2', updatedAt: 10, latestOrchestration: { sessionId: 's1' } });
    const index = buildSessionThreadIndex([t1, t2], null);
    const list = index.bySessionId.get('s1') ?? [];
    expect(list[0].id).toBe('t2');
    expect(list[1].id).toBe('t1');
  });
});

describe('deriveAttention', () => {
  it('returns approval kind when approvalCount > 0', () => {
    const target = {
      cacheKey: 's',
      isActive: false,
      approvalCount: 2,
      thread: makeThread({ status: 'running' }),
    };
    expect(deriveAttention(target, false).kind).toBe('approval');
  });

  it('returns failed kind for failed thread', () => {
    const target = {
      cacheKey: 's',
      isActive: false,
      approvalCount: 0,
      thread: makeThread({ status: 'failed' }),
    };
    expect(deriveAttention(target, false)).toMatchObject({ kind: 'failed', isSticky: true });
  });

  it('returns completed-unseen when hasUnseenCompletion is true', () => {
    const target = {
      cacheKey: 's',
      isActive: false,
      approvalCount: 0,
      thread: makeThread({ status: 'complete' }),
    };
    expect(deriveAttention(target, true)).toMatchObject({
      kind: 'completed-unseen',
      isSticky: true,
    });
  });

  it('returns live for busy thread with no approval or completion', () => {
    const target = {
      cacheKey: 's',
      isActive: false,
      approvalCount: 0,
      thread: makeThread({ status: 'running' }),
    };
    expect(deriveAttention(target, false)).toMatchObject({ kind: 'live', isSticky: false });
  });
});

describe('applySnooze', () => {
  it('suppresses snoozeable kinds while snooze is active', () => {
    const state = {
      kind: 'completed-unseen' as const,
      rank: 2,
      label: 'Done',
      tone: 'success' as const,
      isSticky: true,
    };
    expect(applySnooze(state, Date.now() + 10_000, Date.now())).toEqual(NONE_ATTENTION);
  });

  it('does not suppress sticky terminal states', () => {
    const state = {
      kind: 'failed' as const,
      rank: 4,
      label: 'Failure',
      tone: 'error' as const,
      isSticky: true,
    };
    expect(applySnooze(state, Date.now() + 10_000, Date.now()).kind).toBe('failed');
  });

  it('passes through when snooze has expired', () => {
    const state = {
      kind: 'completed-unseen' as const,
      rank: 2,
      label: 'Done',
      tone: 'success' as const,
      isSticky: true,
    };
    expect(applySnooze(state, Date.now() - 1, Date.now())).toEqual(state);
  });

  it('covers all snoozeable kinds', () => {
    expect(SNOOZEABLE_KINDS.has('approval')).toBe(true);
    expect(SNOOZEABLE_KINDS.has('completed-unseen')).toBe(true);
    expect(SNOOZEABLE_KINDS.has('failed')).toBe(false);
    expect(SNOOZEABLE_KINDS.has('review')).toBe(false);
  });
});

describe('updateCacheEntry / buildTargetMap — unseen completion tracking', () => {
  it('marks unseen completion when transitioning from busy to complete while inactive', () => {
    const thread = makeThread({ status: 'complete', updatedAt: 11 });
    const target = { cacheKey: 's1', isActive: false, approvalCount: 0, thread };
    const previous = {
      status: 'running' as const,
      threadKey: 'thread-1:10',
      unseenThreadKey: null,
    };
    const entry = updateCacheEntry(previous, target);
    expect(entry.unseenThreadKey).toBe('thread-1:11');
  });

  it('buildTargetMap applies snooze per entry', () => {
    const thread = makeThread({ status: 'complete', updatedAt: 11 });
    const target = { cacheKey: 's1', isActive: false, approvalCount: 0, thread };
    const cache = new Map([
      ['s1', { status: 'running' as const, threadKey: 'thread-1:10', unseenThreadKey: null }],
    ]);
    const snoozeMap = new Map([['s1', Date.now() + 60_000]]);
    const result = buildTargetMap([target], cache, snoozeMap, Date.now());
    expect(result['s1'].kind).toBe('none');
  });
});
