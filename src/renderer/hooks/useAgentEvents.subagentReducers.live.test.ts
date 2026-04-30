/**
 * useAgentEvents.subagentReducers.live.test.ts
 *
 * Tests for live-event subagent linking through the reducer.
 * Tests run against the real reducer — no mocks of the reducer internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState } from './useAgentEvents.helpers';
import { initialAgentState, reducer } from './useAgentEvents.helpers';

// ─── Stubs ────────────────────────────────────────────────────────────────────

// resolveParentAndTimestamps fires a diagnostic async call to
// window.electronAPI?.config?.getAll() — stub it to prevent unhandled
// rejection noise in the test output.
beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: {
        config: {
          getAll: vi.fn().mockResolvedValue({}),
        },
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParentSession(
  overrides: Partial<Parameters<typeof reducer>[1] & { type: 'AGENT_START' }> = {},
): AgentState {
  return reducer(initialAgentState, {
    type: 'AGENT_START',
    sessionId: 'parent-1',
    taskLabel: 'Parent task',
    timestamp: 1000,
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AGENT_START with parentSessionId — live events', () => {
  it('sets parentSessionId on session when payload carries it', () => {
    const state = reducer(initialAgentState, {
      type: 'AGENT_START',
      sessionId: 'child-1',
      taskLabel: 'Child task',
      timestamp: 2000,
      parentSessionId: 'parent-1',
    });

    const child = state.sessions.find((s) => s.id === 'child-1');
    expect(child).toBeDefined();
    expect(child?.parentSessionId).toBe('parent-1');
  });

  it('parent session appears in live group even when restored:true after live child arrives', () => {
    // Simulate: parent was persisted (restored:true, status:complete),
    // then a live AGENT_START arrives for a child referencing that parent.
    const restoredParent = {
      id: 'parent-restored',
      taskLabel: 'Restored parent',
      status: 'complete' as const,
      startedAt: 500,
      completedAt: 900,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      restored: true,
    };

    const stateWithRestored: AgentState = {
      ...initialAgentState,
      sessions: [restoredParent],
    };

    // When the live AGENT_START fires for a child, the parent is still at
    // complete+restored — the child arrival alone doesn't change the parent.
    // A subsequent AGENT_START for the parent clears the restored flag and
    // moves it to running. Verify the child links correctly either way.
    const withChild = reducer(stateWithRestored, {
      type: 'AGENT_START',
      sessionId: 'child-live',
      taskLabel: 'Live child',
      timestamp: 1000,
      parentSessionId: 'parent-restored',
    });

    const child = withChild.sessions.find((s) => s.id === 'child-live');
    expect(child?.parentSessionId).toBe('parent-restored');

    // Now fire AGENT_START for the parent (live reconnect). The parent should
    // move out of restored/complete into running (live bucket predicate).
    const withLiveParent = reducer(withChild, {
      type: 'AGENT_START',
      sessionId: 'parent-restored',
      taskLabel: 'Restored parent',
      timestamp: 1050,
    });

    const parent = withLiveParent.sessions.find((s) => s.id === 'parent-restored');
    expect(parent?.status).toBe('running');
    expect(parent?.restored).toBe(false);

    // Verify the live bucket predicate matches
    const isCurrent = (s: { status: string }) =>
      s.status === 'running' || s.status === 'idle';
    expect(withLiveParent.sessions.filter(isCurrent)).toHaveLength(2);
  });

  it('pendingSubagentLinks flushes when child arrives after parent mapping is known', () => {
    // LINK_SUBAGENT fires before the child's AGENT_START — e.g. tool event
    // arrives first. The link must be held in pendingSubagentLinks and then
    // consumed when AGENT_START arrives.
    const withLink = reducer(initialAgentState, {
      type: 'LINK_SUBAGENT',
      parentSessionId: 'parent-2',
      childSessionId: 'child-2',
    });

    expect(withLink.pendingSubagentLinks['child-2']).toBe('parent-2');

    const withChild = reducer(withLink, {
      type: 'AGENT_START',
      sessionId: 'child-2',
      taskLabel: 'Child via pending link',
      timestamp: 3000,
    });

    const child = withChild.sessions.find((s) => s.id === 'child-2');
    expect(child?.parentSessionId).toBe('parent-2');
    // The pending entry must be consumed (not left dangling).
    expect(withChild.pendingSubagentLinks['child-2']).toBeUndefined();
  });

  it('two children under same parent both have parentSessionId set', () => {
    const state0 = makeParentSession();

    const state1 = reducer(state0, {
      type: 'AGENT_START',
      sessionId: 'child-a',
      taskLabel: 'Child A',
      timestamp: 2000,
      parentSessionId: 'parent-1',
    });

    const state2 = reducer(state1, {
      type: 'AGENT_START',
      sessionId: 'child-b',
      taskLabel: 'Child B',
      timestamp: 2100,
      parentSessionId: 'parent-1',
    });

    const childA = state2.sessions.find((s) => s.id === 'child-a');
    const childB = state2.sessions.find((s) => s.id === 'child-b');

    expect(childA?.parentSessionId).toBe('parent-1');
    expect(childB?.parentSessionId).toBe('parent-1');
  });

  it('parentSessionId is preserved on subsequent updates to the same session', () => {
    // First AGENT_START creates the session with parentSessionId.
    const state1 = reducer(initialAgentState, {
      type: 'AGENT_START',
      sessionId: 'child-persist',
      taskLabel: 'Persistent child',
      timestamp: 2000,
      parentSessionId: 'parent-1',
    });

    expect(state1.sessions[0].parentSessionId).toBe('parent-1');

    // Second AGENT_START (re-resume) without parentSessionId must preserve it.
    const state2 = reducer(state1, {
      type: 'AGENT_START',
      sessionId: 'child-persist',
      taskLabel: 'Persistent child (resumed)',
      timestamp: 3000,
      // no parentSessionId in this second event
    });

    const child = state2.sessions.find((s) => s.id === 'child-persist');
    expect(child?.parentSessionId).toBe('parent-1');
  });
});

describe('findTemporalParent — live temporal linking', () => {
  it('links child via timestamp when no explicit parentSessionId is provided', () => {
    // Record a subagent tool timestamp on the parent, then fire AGENT_START
    // for the child within the 30s window — the temporal link should attach.
    const parentTimestamp = 10_000;

    const state0 = makeParentSession({ sessionId: 'parent-temporal', timestamp: parentTimestamp });

    const withStamp = reducer(state0, {
      type: 'RECORD_SUBAGENT_TOOL',
      parentSessionId: 'parent-temporal',
      timestamp: parentTimestamp + 500,
    });

    expect(withStamp.pendingSubagentTimestamps).toHaveLength(1);

    // Child arrives within the temporal window.
    const withChild = reducer(withStamp, {
      type: 'AGENT_START',
      sessionId: 'child-temporal',
      taskLabel: 'Temporal child',
      timestamp: parentTimestamp + 1500,
    });

    const child = withChild.sessions.find((s) => s.id === 'child-temporal');
    expect(child?.parentSessionId).toBe('parent-temporal');
    // Stamp must be consumed.
    expect(withChild.pendingSubagentTimestamps).toHaveLength(0);
  });

  it('does not link child via timestamp when outside the 30s window', () => {
    const parentTimestamp = 10_000;

    const state0 = makeParentSession({ sessionId: 'parent-expired', timestamp: parentTimestamp });

    const withStamp = reducer(state0, {
      type: 'RECORD_SUBAGENT_TOOL',
      parentSessionId: 'parent-expired',
      timestamp: parentTimestamp + 500,
    });

    // Child arrives 31 seconds later — outside the window.
    const withChild = reducer(withStamp, {
      type: 'AGENT_START',
      sessionId: 'child-expired',
      taskLabel: 'Expired child',
      timestamp: parentTimestamp + 31_000,
    });

    const child = withChild.sessions.find((s) => s.id === 'child-expired');
    expect(child?.parentSessionId).toBeUndefined();
  });
});
