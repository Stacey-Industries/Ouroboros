/**
 * AgentTree.subagent.test.tsx — Tests for AgentTree subagent nesting behavior.
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentTree, hasTreeStructure } from './AgentTree';
import type { AgentSession } from './types';

// ─── AgentCard mock ───────────────────────────────────────────────────────────
// AgentCard has a deep dependency tree (useElapsedMs, AgentCardLayout, etc.)
// that requires complex setup for jsdom. Since AgentTree tests focus on tree
// structure and mode switching, mock AgentCard to render session id only.

vi.mock('./AgentCard', () => ({
  AgentCard: ({ session }: { session: AgentSession }) => (
    <div data-testid={`agent-card-${session.id}`}>{session.taskLabel}</div>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'sess-1',
    taskLabel: 'Task 1',
    status: 'running',
    startedAt: 1000,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

// ─── hasTreeStructure ─────────────────────────────────────────────────────────

describe('hasTreeStructure — pure function', () => {
  it('returns true when at least one session has a parentSessionId that is also in the list', () => {
    const parent = makeSession({ id: 'parent-1', taskLabel: 'Parent' });
    const child = makeSession({
      id: 'child-1',
      taskLabel: 'Child',
      parentSessionId: 'parent-1',
    });
    expect(hasTreeStructure([parent, child])).toBe(true);
  });

  it('returns false when no sessions have parentSessionId', () => {
    const a = makeSession({ id: 'a' });
    const b = makeSession({ id: 'b' });
    expect(hasTreeStructure([a, b])).toBe(false);
  });

  it('returns false when parentSessionId references an id not in the list', () => {
    const child = makeSession({ id: 'child-1', parentSessionId: 'missing-parent' });
    expect(hasTreeStructure([child])).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(hasTreeStructure([])).toBe(false);
  });

  it('returns false for a single session with no parentSessionId', () => {
    const single = makeSession({ id: 'solo' });
    expect(hasTreeStructure([single])).toBe(false);
  });
});

// ─── AgentTree rendering ──────────────────────────────────────────────────────

describe('AgentTree — subagent nesting', () => {
  const noop = (): void => undefined;

  it('renders in tree mode when at least one session has parentSessionId', () => {
    const parent = makeSession({ id: 'parent-1', taskLabel: 'Parent task' });
    const child = makeSession({
      id: 'child-1',
      taskLabel: 'Child task',
      parentSessionId: 'parent-1',
    });

    render(<AgentTree sessions={[parent, child]} onDismiss={noop} />);

    expect(screen.getByTestId('agent-card-parent-1')).toBeTruthy();
    expect(screen.getByTestId('agent-card-child-1')).toBeTruthy();
    expect(screen.getByText('Parent task')).toBeTruthy();
    expect(screen.getByText('Child task')).toBeTruthy();
  });

  it('renders in flat mode (all as roots) when no sessions have parentSessionId', () => {
    const a = makeSession({ id: 'sess-a', taskLabel: 'Session A' });
    const b = makeSession({ id: 'sess-b', taskLabel: 'Session B' });

    render(<AgentTree sessions={[a, b]} onDismiss={noop} />);

    expect(screen.getByTestId('agent-card-sess-a')).toBeTruthy();
    expect(screen.getByTestId('agent-card-sess-b')).toBeTruthy();
  });

  it('places parent at depth=0 and child at depth=1 in the DOM hierarchy', () => {
    const parent = makeSession({ id: 'p1', taskLabel: 'Parent' });
    const child = makeSession({ id: 'c1', taskLabel: 'Child', parentSessionId: 'p1' });

    const { container } = render(<AgentTree sessions={[parent, child]} onDismiss={noop} />);

    const parentCard = container.querySelector('[data-testid="agent-card-p1"]');
    const childCard = container.querySelector('[data-testid="agent-card-c1"]');

    expect(parentCard).not.toBeNull();
    expect(childCard).not.toBeNull();

    // The child card must be a descendant of the parent card's containing node,
    // not a sibling at the same level. Verify by checking the child is NOT a
    // direct child of the root tree container.
    const rootContainer = container.firstElementChild;
    const directChildren = Array.from(rootContainer?.children ?? []);
    const childIsRoot = directChildren.some((el) => el.contains(childCard));
    // The child is rendered inside the parent's subtree, so the root has exactly
    // one direct tree-node child (the parent), which contains the child.
    expect(directChildren).toHaveLength(1);
    expect(childIsRoot).toBe(true);
  });

  it('shows branch toggle button when parent has children', () => {
    const parent = makeSession({ id: 'par', taskLabel: 'Parent' });
    const child = makeSession({ id: 'chi', taskLabel: 'Child', parentSessionId: 'par' });

    render(<AgentTree sessions={[parent, child]} onDismiss={noop} />);

    // BranchToggle renders "N subagent(s)" text
    expect(screen.getByText('1 subagent')).toBeTruthy();
  });

  it('two children under same parent both render and are linked', () => {
    const parent = makeSession({ id: 'top', taskLabel: 'Top' });
    const childA = makeSession({ id: 'ca', taskLabel: 'Child A', parentSessionId: 'top' });
    const childB = makeSession({ id: 'cb', taskLabel: 'Child B', parentSessionId: 'top' });

    render(<AgentTree sessions={[parent, childA, childB]} onDismiss={noop} />);

    expect(screen.getByTestId('agent-card-top')).toBeTruthy();
    expect(screen.getByTestId('agent-card-ca')).toBeTruthy();
    expect(screen.getByTestId('agent-card-cb')).toBeTruthy();
    expect(screen.getByText('2 subagents')).toBeTruthy();
  });
});

// ─── useTree predicate (tested as pure logic via hasTreeStructure) ─────────────

describe('useTree predicate — matches AgentMonitorManager logic', () => {
  // The real predicate is:
  //   visibleCurrentSessions.length > 0 && !filterQuery && hasTreeStructure(sessions)
  // We test the hasTreeStructure part exhaustively above. These tests verify
  // the composite predicate logic by asserting the function inputs and outputs.

  it('tree mode activates on first frame when live child arrives', () => {
    // Simulates the exact moment a live AGENT_START with parentSessionId is
    // processed: sessions array now has parent + child with parentSessionId.
    const parent = makeSession({ id: 'live-parent', taskLabel: 'Live parent' });
    const liveChild = makeSession({
      id: 'live-child',
      taskLabel: 'Live child',
      parentSessionId: 'live-parent',
    });

    const sessions = [parent, liveChild];
    const filterQuery = '';

    const useTree = sessions.length > 0 && !filterQuery && hasTreeStructure(sessions);
    expect(useTree).toBe(true);
  });

  it('filter query disables tree mode even when parentSessionId is set', () => {
    const parent = makeSession({ id: 'fp', taskLabel: 'Filtered parent' });
    const child = makeSession({
      id: 'fc',
      taskLabel: 'Filtered child',
      parentSessionId: 'fp',
    });

    const sessions = [parent, child];
    const filterQuery = 'some filter';

    const useTree = sessions.length > 0 && !filterQuery && hasTreeStructure(sessions);
    expect(useTree).toBe(false);
  });

  it('tree mode is false with empty sessions regardless of filter', () => {
    const useTree = ([] as AgentSession[]).length > 0 && !'' && hasTreeStructure([]);
    expect(useTree).toBe(false);
  });

  it('restored parent + live child produces tree mode', () => {
    // Restored parent carries restored:true but is still present in the list.
    // Tree mode depends only on parentSessionId being set and its parent being
    // present — not on the restored flag.
    const restoredParent = makeSession({
      id: 'rp',
      taskLabel: 'Restored',
      restored: true,
      status: 'running',
    });
    const liveChild = makeSession({
      id: 'lc',
      taskLabel: 'Live child',
      parentSessionId: 'rp',
      status: 'running',
    });

    const sessions = [restoredParent, liveChild];
    const useTree = sessions.length > 0 && !'' && hasTreeStructure(sessions);
    expect(useTree).toBe(true);
  });
});

// ─── AgentTree rendering with restored parent ─────────────────────────────────

describe('AgentTree — restored parent in live group', () => {
  const noop = (): void => undefined;

  it('renders parent session card even when restored:true', () => {
    const restoredParent = makeSession({
      id: 'rp-live',
      taskLabel: 'Restored parent (now live)',
      restored: true,
      status: 'running',
    });
    const liveChild = makeSession({
      id: 'lc-live',
      taskLabel: 'Live child',
      parentSessionId: 'rp-live',
    });

    render(<AgentTree sessions={[restoredParent, liveChild]} onDismiss={noop} />);

    expect(screen.getByTestId('agent-card-rp-live')).toBeTruthy();
    expect(screen.getByTestId('agent-card-lc-live')).toBeTruthy();
  });

  it('renders both cards when parent is restored:true + status:complete while child is running', () => {
    // Production scenario: parent was persisted (complete+restored) and the
    // live reconnect AGENT_START has not yet arrived. A live child has already
    // started and points back to this parent. AgentTree must not hide the
    // parent just because it carries status:'complete' + restored:true — the
    // presence of a live child means this tree must still be visible.
    const restoredCompleteParent = makeSession({
      id: 'rp-complete',
      taskLabel: 'Restored complete parent',
      restored: true,
      status: 'complete',
    });
    const liveChild = makeSession({
      id: 'lc-running',
      taskLabel: 'Live running child',
      parentSessionId: 'rp-complete',
      status: 'running',
    });

    render(<AgentTree sessions={[restoredCompleteParent, liveChild]} onDismiss={noop} />);

    expect(screen.getByTestId('agent-card-rp-complete')).toBeTruthy();
    expect(screen.getByTestId('agent-card-lc-running')).toBeTruthy();
  });
});
