/**
 * useAgentEvents.endSession.test.ts — Tests for the defer-end-while-subagents-live
 * mechanism (Bug 4 fix). Verifies that:
 *  - A parent with live children defers its end and stays 'running'.
 *  - When the last child ends, the parent's pending end finalizes.
 *  - Nested chains (parent → child → grandchild) finalize transitively.
 *  - forceFinalizeEnd applies a deferred end regardless of remaining children.
 *  - A session with no children ends synchronously (regression check).
 */

import { describe, expect, it } from 'vitest';

import type { AgentSession } from '../components/AgentMonitor/types';
import { endSession, forceFinalizeEnd } from './useAgentEvents.endSession';
import type { AgentState } from './useAgentEvents.helpers';
import { initialAgentState } from './useAgentEvents.helpers';

function makeSession(overrides: Partial<AgentSession> & { id: string }): AgentSession {
  return {
    id: overrides.id,
    taskLabel: overrides.taskLabel ?? `Task ${overrides.id}`,
    status: 'running',
    startedAt: 1000,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

function withSessions(sessions: AgentSession[]): AgentState {
  return { ...initialAgentState, sessions };
}

describe('endSession — no live children', () => {
  it('completes the session synchronously', () => {
    const state = withSessions([makeSession({ id: 'parent' })]);
    const next = endSession(state, {
      type: 'AGENT_END',
      sessionId: 'parent',
      timestamp: 2000,
    });
    expect(next.sessions[0].status).toBe('complete');
    expect(next.sessions[0].pendingEnd).toBeUndefined();
    expect(next.sessions[0].completedAt).toBe(2000);
  });

  it('marks session as error when an error is present', () => {
    const state = withSessions([makeSession({ id: 'parent' })]);
    const next = endSession(state, {
      type: 'AGENT_END',
      sessionId: 'parent',
      timestamp: 2000,
      error: 'boom',
    });
    expect(next.sessions[0].status).toBe('error');
    expect(next.sessions[0].error).toBe('boom');
  });

  it('is a no-op for unknown session IDs', () => {
    const state = withSessions([makeSession({ id: 'parent' })]);
    const next = endSession(state, {
      type: 'AGENT_END',
      sessionId: 'ghost',
      timestamp: 2000,
    });
    expect(next).toBe(state);
  });
});

describe('endSession — defers while live children exist', () => {
  it('keeps parent running and records pendingEnd', () => {
    const state = withSessions([
      makeSession({ id: 'parent' }),
      makeSession({ id: 'child', parentSessionId: 'parent' }),
    ]);
    const next = endSession(state, {
      type: 'AGENT_END',
      sessionId: 'parent',
      timestamp: 2000,
      costUsd: 0.05,
    });
    const parent = next.sessions.find((s) => s.id === 'parent');
    expect(parent?.status).toBe('running');
    expect(parent?.completedAt).toBeUndefined();
    expect(parent?.pendingEnd?.timestamp).toBe(2000);
    expect(parent?.pendingEnd?.costUsd).toBe(0.05);
  });

  it('finalizes parent when its only child ends', () => {
    const deferred = withSessions([
      makeSession({ id: 'parent' }),
      makeSession({ id: 'child', parentSessionId: 'parent' }),
    ]);
    const afterParentEnd = endSession(deferred, {
      type: 'AGENT_END',
      sessionId: 'parent',
      timestamp: 2000,
    });
    expect(afterParentEnd.sessions.find((s) => s.id === 'parent')?.status).toBe('running');

    const afterChildEnd = endSession(afterParentEnd, {
      type: 'AGENT_END',
      sessionId: 'child',
      timestamp: 3000,
    });
    const parent = afterChildEnd.sessions.find((s) => s.id === 'parent');
    expect(parent?.status).toBe('complete');
    expect(parent?.pendingEnd).toBeUndefined();
    expect(parent?.completedAt).toBe(2000);
  });

  it('keeps parent deferred while sibling children remain', () => {
    const state = withSessions([
      makeSession({ id: 'parent' }),
      makeSession({ id: 'child-a', parentSessionId: 'parent' }),
      makeSession({ id: 'child-b', parentSessionId: 'parent' }),
    ]);
    const afterParent = endSession(state, {
      type: 'AGENT_END',
      sessionId: 'parent',
      timestamp: 2000,
    });
    const afterFirstChild = endSession(afterParent, {
      type: 'AGENT_END',
      sessionId: 'child-a',
      timestamp: 2500,
    });
    expect(afterFirstChild.sessions.find((s) => s.id === 'parent')?.status).toBe('running');

    const afterSecondChild = endSession(afterFirstChild, {
      type: 'AGENT_END',
      sessionId: 'child-b',
      timestamp: 3000,
    });
    expect(afterSecondChild.sessions.find((s) => s.id === 'parent')?.status).toBe('complete');
  });
});

describe('endSession — nested chain', () => {
  it('finalizes grandparent and parent transitively when grandchild ends', () => {
    const state = withSessions([
      makeSession({ id: 'gp' }),
      makeSession({ id: 'p', parentSessionId: 'gp' }),
      makeSession({ id: 'gc', parentSessionId: 'p' }),
    ]);
    let working = endSession(state, { type: 'AGENT_END', sessionId: 'gp', timestamp: 2000 });
    working = endSession(working, { type: 'AGENT_END', sessionId: 'p', timestamp: 2100 });
    expect(working.sessions.find((s) => s.id === 'gp')?.status).toBe('running');
    expect(working.sessions.find((s) => s.id === 'p')?.status).toBe('running');

    working = endSession(working, { type: 'AGENT_END', sessionId: 'gc', timestamp: 3000 });
    expect(working.sessions.find((s) => s.id === 'gc')?.status).toBe('complete');
    expect(working.sessions.find((s) => s.id === 'p')?.status).toBe('complete');
    expect(working.sessions.find((s) => s.id === 'gp')?.status).toBe('complete');
  });
});

describe('forceFinalizeEnd', () => {
  it('finalizes a deferred parent even with live children remaining', () => {
    const state = withSessions([
      makeSession({ id: 'parent' }),
      makeSession({ id: 'child', parentSessionId: 'parent' }),
    ]);
    const deferred = endSession(state, {
      type: 'AGENT_END',
      sessionId: 'parent',
      timestamp: 2000,
    });
    const forced = forceFinalizeEnd(deferred, {
      type: 'AGENT_END_FORCE_FINALIZE',
      sessionId: 'parent',
    });
    const parent = forced.sessions.find((s) => s.id === 'parent');
    expect(parent?.status).toBe('complete');
    expect(parent?.pendingEnd).toBeUndefined();
    // Child was unaffected — still running.
    expect(forced.sessions.find((s) => s.id === 'child')?.status).toBe('running');
  });

  it('is a no-op when the session has no pendingEnd', () => {
    const state = withSessions([makeSession({ id: 'parent' })]);
    const next = forceFinalizeEnd(state, {
      type: 'AGENT_END_FORCE_FINALIZE',
      sessionId: 'parent',
    });
    expect(next).toBe(state);
  });

  it('is a no-op for unknown session IDs', () => {
    const state = withSessions([makeSession({ id: 'parent' })]);
    const next = forceFinalizeEnd(state, {
      type: 'AGENT_END_FORCE_FINALIZE',
      sessionId: 'ghost',
    });
    expect(next).toBe(state);
  });
});
