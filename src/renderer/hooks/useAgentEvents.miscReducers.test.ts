import { describe, expect, it } from 'vitest';

import type { AgentState } from './useAgentEvents.helpers';
import {
  type CompactionAction,
  type ConversationTurnAction,
  type NotificationAction,
  type PermissionEventAction,
  type PostCompactAction,
  type PreCompactAction,
  reduceCompaction,
  reduceConversationTurn,
  reduceNotification,
  reducePermissionEvent,
  reducePostCompact,
  reducePreCompact,
} from './useAgentEvents.miscReducers';

const BASE_SESSION = {
  id: 'sess-1',
  taskLabel: 'Test',
  status: 'running' as const,
  startedAt: 1000,
  toolCalls: [],
  inputTokens: 0,
  outputTokens: 0,
};

const BASE_STATE: AgentState = {
  sessions: [BASE_SESSION],
  pendingSubagentLinks: {},
  pendingSubagentTimestamps: [],
};

function makeStateWithSession(sessionId: string): AgentState {
  return {
    sessions: [{
      id: sessionId,
      taskLabel: 'Test',
      status: 'running' as const,
      startedAt: 1000,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
    }],
    pendingSubagentLinks: {},
    pendingSubagentTimestamps: [],
  };
}

describe('reduceConversationTurn', () => {
  it('appends a turn to the session', () => {
    const action: ConversationTurnAction = {
      type: 'CONVERSATION_TURN',
      sessionId: 'sess-1',
      turn: { type: 'prompt', content: 'Hello', timestamp: 2000 },
    };
    const next = reduceConversationTurn(BASE_STATE, action);
    expect(next.sessions[0].conversationTurns).toHaveLength(1);
    expect(next.sessions[0].conversationTurns?.[0].content).toBe('Hello');
  });

  it('initializes conversationTurns array when undefined', () => {
    const action: ConversationTurnAction = {
      type: 'CONVERSATION_TURN',
      sessionId: 'sess-1',
      turn: { type: 'elicitation', content: 'Q?', timestamp: 1 },
    };
    const next = reduceConversationTurn(BASE_STATE, action);
    expect(next.sessions[0].conversationTurns).toHaveLength(1);
  });
});

describe('reduceCompaction', () => {
  it('appends a compaction event to the session', () => {
    const action: CompactionAction = {
      type: 'COMPACTION',
      sessionId: 'sess-1',
      event: { preTokens: 5000, postTokens: 0, timestamp: 3000 },
    };
    const next = reduceCompaction(BASE_STATE, action);
    expect(next.sessions[0].compactions).toHaveLength(1);
    expect(next.sessions[0].compactions?.[0].preTokens).toBe(5000);
  });
});

describe('reducePermissionEvent', () => {
  it('appends a permission event to the session', () => {
    const action: PermissionEventAction = {
      type: 'PERMISSION_EVENT',
      sessionId: 'sess-1',
      event: { type: 'request', toolName: 'Bash', timestamp: 4000 },
    };
    const next = reducePermissionEvent(BASE_STATE, action);
    expect(next.sessions[0].permissionEvents).toHaveLength(1);
    expect(next.sessions[0].permissionEvents?.[0].toolName).toBe('Bash');
  });
});

// ─── Unknown sessionId edge cases ───────────────────────────────────────────

describe('unknown sessionId handling', () => {
  it('reduceConversationTurn returns state unchanged for unknown session', () => {
    const action: ConversationTurnAction = {
      type: 'CONVERSATION_TURN',
      sessionId: 'unknown-session',
      turn: { type: 'prompt', content: 'Hello', timestamp: 1000 },
    };
    const next = reduceConversationTurn(BASE_STATE, action);
    expect(next).toStrictEqual(BASE_STATE);
  });

  it('reducePreCompact returns state unchanged for unknown session', () => {
    const action: PreCompactAction = {
      type: 'PRE_COMPACT',
      sessionId: 'unknown-session',
      tokenCount: 10000,
    };
    const next = reducePreCompact(BASE_STATE, action);
    expect(next).toStrictEqual(BASE_STATE);
  });

  it('reducePostCompact returns state unchanged for unknown session', () => {
    const action: PostCompactAction = {
      type: 'POST_COMPACT',
      sessionId: 'unknown-session',
      tokenCount: 5000,
      timestamp: 2000,
    };
    const next = reducePostCompact(BASE_STATE, action);
    expect(next).toStrictEqual(BASE_STATE);
  });

  it('reducePermissionEvent returns state unchanged for unknown session', () => {
    const action: PermissionEventAction = {
      type: 'PERMISSION_EVENT',
      sessionId: 'unknown-session',
      event: { type: 'request', toolName: 'Bash', timestamp: 1000 },
    };
    const next = reducePermissionEvent(BASE_STATE, action);
    expect(next).toStrictEqual(BASE_STATE);
  });

  it('reduceNotification returns state unchanged for unknown session', () => {
    const action: NotificationAction = {
      type: 'NOTIFICATION',
      sessionId: 'unknown-session',
      message: 'Test notification',
    };
    const next = reduceNotification(BASE_STATE, action);
    expect(next).toStrictEqual(BASE_STATE);
  });
});

// ─── Compaction merge flow ───────────────────────────────────────────────────

describe('compaction merge flow', () => {
  it('PRE_COMPACT stores pending tokens, POST_COMPACT creates merged event', () => {
    const state = makeStateWithSession('sess-1');

    const preAction: PreCompactAction = {
      type: 'PRE_COMPACT',
      sessionId: 'sess-1',
      tokenCount: 180000,
    };
    const afterPre = reducePreCompact(state, preAction);
    expect(afterPre.sessions[0].pendingPreCompactTokens).toBe(180000);
    expect(afterPre.sessions[0].compactions).toBeUndefined();

    const postAction: PostCompactAction = {
      type: 'POST_COMPACT',
      sessionId: 'sess-1',
      tokenCount: 95000,
      timestamp: 5000,
    };
    const afterPost = reducePostCompact(afterPre, postAction);
    expect(afterPost.sessions[0].pendingPreCompactTokens).toBeUndefined();
    expect(afterPost.sessions[0].compactions).toHaveLength(1);
    expect(afterPost.sessions[0].compactions?.[0].preTokens).toBe(180000);
    expect(afterPost.sessions[0].compactions?.[0].postTokens).toBe(95000);
    expect(afterPost.sessions[0].compactions?.[0].timestamp).toBe(5000);
  });

  it('POST_COMPACT without prior PRE_COMPACT uses 0 for preTokens', () => {
    const state = makeStateWithSession('sess-1');
    const postAction: PostCompactAction = {
      type: 'POST_COMPACT',
      sessionId: 'sess-1',
      tokenCount: 50000,
      timestamp: 3000,
    };
    const afterPost = reducePostCompact(state, postAction);
    expect(afterPost.sessions[0].compactions).toHaveLength(1);
    expect(afterPost.sessions[0].compactions?.[0].preTokens).toBe(0);
    expect(afterPost.sessions[0].compactions?.[0].postTokens).toBe(50000);
  });
});

// ─── reduceNotification ──────────────────────────────────────────────────────

describe('reduceNotification', () => {
  it('appends a notification message to the session', () => {
    const action: NotificationAction = {
      type: 'NOTIFICATION',
      sessionId: 'sess-1',
      message: 'Task complete',
    };
    const next = reduceNotification(BASE_STATE, action);
    expect(next.sessions[0].notifications).toHaveLength(1);
    expect(next.sessions[0].notifications?.[0]).toBe('Task complete');
  });

  it('appends multiple notifications preserving order', () => {
    const state = makeStateWithSession('sess-1');
    const first = reduceNotification(state, {
      type: 'NOTIFICATION', sessionId: 'sess-1', message: 'First',
    });
    const second = reduceNotification(first, {
      type: 'NOTIFICATION', sessionId: 'sess-1', message: 'Second',
    });
    expect(second.sessions[0].notifications).toEqual(['First', 'Second']);
  });
});

// ─── reducePreCompact ────────────────────────────────────────────────────────

describe('reducePreCompact', () => {
  it('stores pendingPreCompactTokens on the session', () => {
    const action: PreCompactAction = {
      type: 'PRE_COMPACT',
      sessionId: 'sess-1',
      tokenCount: 75000,
    };
    const next = reducePreCompact(BASE_STATE, action);
    expect(next.sessions[0].pendingPreCompactTokens).toBe(75000);
  });
});
