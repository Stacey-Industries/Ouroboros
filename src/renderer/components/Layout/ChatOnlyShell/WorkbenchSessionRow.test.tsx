/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkbenchRecentChatItem } from './useWorkbenchRecentChats';
import type { WorkbenchSessionItem } from './useWorkbenchSessions';
import { WorkbenchSessionRow } from './WorkbenchSessionRow';

function makeSessionItem(overrides: Partial<WorkbenchSessionItem> = {}): WorkbenchSessionItem {
  return {
    kind: 'session',
    id: 'session-1',
    projectLabel: 'alpha',
    projectRoot: '/workspace/alpha',
    shortId: 'session-',
    lastUsedLabel: '5m ago',
    status: 'active',
    isActive: false,
    isPinned: false,
    isWorktree: false,
    terminalCount: 1,
    chatCount: 2,
    hasConversation: true,
    hasActiveThread: false,
    attention: { kind: 'none', label: null, rank: 0, tone: 'neutral', isSticky: false },
    threadStatus: null,
    linkedThreadId: null,
    rawSession: {
      id: 'session-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-04-22T14:55:00.000Z',
      projectRoot: '/workspace/alpha',
      worktree: false,
      tags: [],
      activeTerminalIds: [],
      costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
      telemetry: { correlationIds: [], telemetrySessionId: 'session-1' },
    },
    ...overrides,
  };
}

function makeRecentChatItem(
  overrides: Partial<WorkbenchRecentChatItem> = {},
): WorkbenchRecentChatItem {
  return {
    kind: 'recent-chat',
    id: 'thread-1',
    threadId: 'thread-1',
    projectLabel: 'alpha',
    projectRoot: '/workspace/alpha',
    title: 'Recent fix chat',
    shortId: 'thread-1',
    lastUpdatedLabel: '2m ago',
    messageCount: 3,
    isActive: false,
    isPinned: false,
    linkedSessionId: null,
    attention: { kind: 'none', label: null, rank: 0, tone: 'neutral', isSticky: false },
    rawThread: {
      version: 1,
      id: 'thread-1',
      workspaceRoot: '/workspace/alpha',
      createdAt: 1,
      updatedAt: 10,
      title: 'Recent fix chat',
      status: 'complete',
      messages: [],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('WorkbenchSessionRow', () => {
  it('renders session metadata chips and metrics from real session state', () => {
    render(
      <WorkbenchSessionRow
        item={makeSessionItem({
          isPinned: true,
          isWorktree: true,
          threadStatus: 'running',
          attention: { kind: 'failed', label: 'Failure', rank: 4, tone: 'error', isSticky: true },
          status: 'archived',
        })}
      />,
    );

    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('session-')).toBeTruthy();
    expect(screen.getByText('Pinned')).toBeTruthy();
    expect(screen.getByText('Worktree')).toBeTruthy();
    expect(screen.getByText('Failure')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.getByText('1 terminal')).toBeTruthy();
    expect(screen.getByText('2 chats')).toBeTruthy();
  });

  it('renders recent chat rows without fabricating session-only chips', () => {
    render(
      <WorkbenchSessionRow
        item={makeRecentChatItem({
          isPinned: true,
          attention: {
            kind: 'approval',
            label: 'Approval',
            rank: 5,
            tone: 'warning',
            isSticky: true,
          },
        })}
      />,
    );

    expect(screen.getByText('Recent fix chat')).toBeTruthy();
    expect(screen.getByText('Approval')).toBeTruthy();
    expect(screen.getByText('3 msgs')).toBeTruthy();
    expect(screen.queryByText('Worktree')).toBeNull();
  });

  it('shows an exclamation status mark for approval attention', () => {
    render(
      <WorkbenchSessionRow
        item={makeSessionItem({
          attention: {
            kind: 'approval',
            label: 'Approval',
            rank: 5,
            tone: 'warning',
            isSticky: true,
          },
          threadStatus: 'running',
        })}
      />,
    );

    const mark = screen.getByTestId('workbench-approval-attention-mark');
    expect(mark.textContent).toBe('!');
    expect(screen.queryByText('Live')).toBeNull();
  });

  it('calls onSelect on click and keyboard activation', () => {
    const onSelect = vi.fn();
    render(<WorkbenchSessionRow item={makeSessionItem()} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('workbench-session-row'));
    fireEvent.keyDown(screen.getByTestId('workbench-session-row'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('workbench-session-row'), { key: ' ' });

    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenLastCalledWith('session-1');
  });

  it('marks the row as selected when active', () => {
    render(<WorkbenchSessionRow item={makeSessionItem({ isActive: true })} />);
    expect(screen.getByRole('row').getAttribute('aria-selected')).toBe('true');
  });

  it('calls onCompare without selecting the row', () => {
    const onSelect = vi.fn();
    const onCompare = vi.fn();
    render(
      <WorkbenchSessionRow
        item={makeSessionItem({ linkedThreadId: 'thread-2' })}
        onSelect={onSelect}
        onCompare={onCompare}
        showCompareAction={true}
      />,
    );

    fireEvent.click(screen.getByTestId('workbench-session-compare'));

    expect(onCompare).toHaveBeenCalledWith('session-1');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
