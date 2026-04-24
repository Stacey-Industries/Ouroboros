/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkbenchCompare } from './useWorkbenchCompare';
import type { WorkbenchSessionItem } from './useWorkbenchSessions';

function makeItem(overrides: Partial<WorkbenchSessionItem> = {}): WorkbenchSessionItem {
  return {
    kind: 'session',
    id: 'session-2',
    projectLabel: 'beta',
    projectRoot: '/workspace/beta',
    shortId: 'session-',
    lastUsedLabel: '2m ago',
    status: 'active',
    isActive: false,
    isPinned: false,
    isWorktree: false,
    terminalCount: 1,
    chatCount: 1,
    hasConversation: true,
    hasActiveThread: false,
    attention: { kind: 'none', rank: 0, label: null, tone: 'neutral', isSticky: false },
    threadStatus: 'complete',
    linkedThreadId: 'thread-2',
    rawSession: {
      id: 'session-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-04-22T00:00:00.000Z',
      projectRoot: '/workspace/beta',
      worktree: false,
      tags: [],
      activeTerminalIds: [],
      costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
      telemetry: { correlationIds: [], telemetrySessionId: 'session-2' },
    },
    ...overrides,
  };
}

describe('useWorkbenchCompare', () => {
  it('opens a compare target for eligible background sessions', () => {
    const item = makeItem();
    const { result } = renderHook(() => useWorkbenchCompare({ items: [item] }));

    expect(result.current.canCompare(item)).toBe(true);
    act(() => {
      result.current.openCompare('session-2');
    });

    expect(result.current.compareTarget).toEqual({
      sessionId: 'session-2',
      projectRoot: '/workspace/beta',
      threadId: 'thread-2',
      projectLabel: 'beta',
    });
  });

  it('rejects active or unlinked sessions', () => {
    const activeItem = makeItem({ isActive: true });
    const unlinkedItem = makeItem({ id: 'session-3', linkedThreadId: null });
    const { result } = renderHook(() => useWorkbenchCompare({ items: [activeItem, unlinkedItem] }));

    expect(result.current.canCompare(activeItem)).toBe(false);
    expect(result.current.canCompare(unlinkedItem)).toBe(false);
  });
});
