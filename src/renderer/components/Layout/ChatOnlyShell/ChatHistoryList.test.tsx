/**
 * @vitest-environment jsdom
 *
 * ChatHistoryList — smoke tests (Wave 44 Phase B).
 *
 * Covers:
 *  - Renders without throwing.
 *  - Empty state shown when no threads.
 *  - Pinned threads appear in pinned section.
 *  - Deleted threads (deletedAt set) are hidden.
 *  - Threads grouped by project when multiple projects present.
 *  - Group header hidden when only one project.
 *  - onSelectThread called when a row is clicked.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../../types/electron';
import { ChatHistoryList } from './ChatHistoryList';

afterEach(() => cleanup());

vi.mock('./ChatHistoryRow', () => ({
  ChatHistoryRow: ({
    thread,
    completionIndicator,
    isActive,
    onClick,
  }: {
    thread: AgentChatThreadRecord;
    completionIndicator?: string;
    isActive: boolean;
    onClick: (id: string) => void;
    onDelete: (id: string) => Promise<void>;
    onRename: (t: AgentChatThreadRecord) => void;
  }) => (
    <div
      data-testid="chat-history-row"
      data-thread-id={thread.id}
      data-completion-indicator={completionIndicator ?? 'none'}
      data-active={String(isActive)}
      onClick={() => onClick(thread.id)}
    >
      {thread.title}
    </div>
  ),
}));

function makeThread(overrides: Partial<AgentChatThreadRecord>): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-default',
    workspaceRoot: '/project/alpha',
    createdAt: Date.now() - 7200_000,
    updatedAt: Date.now() - 60_000,
    title: 'Default thread',
    status: 'complete',
    messages: [],
    ...overrides,
  };
}

const THREAD_A = makeThread({ id: 'a', title: 'Thread A', workspaceRoot: '/project/alpha' });
const THREAD_B = makeThread({
  id: 'b',
  title: 'Thread B',
  workspaceRoot: '/project/alpha',
  updatedAt: Date.now() - 120_000,
});
const THREAD_BETA = makeThread({ id: 'c', title: 'Thread Beta', workspaceRoot: '/project/beta' });
const THREAD_PINNED = makeThread({ id: 'p', title: 'Pinned Thread', pinned: true });
const THREAD_DELETED = makeThread({
  id: 'd',
  title: 'Deleted Thread',
  deletedAt: Date.now() - 1000,
});

const defaultProps = {
  activeThreadId: null,
  onSelectThread: vi.fn(),
  onDeleteThread: vi.fn().mockResolvedValue(undefined),
  onRenameThread: vi.fn(),
};

describe('ChatHistoryList', () => {
  it('renders without throwing', () => {
    const { container } = render(<ChatHistoryList {...defaultProps} threads={[THREAD_A]} />);
    expect(container).toBeDefined();
  });

  it('shows empty state when no threads', () => {
    render(<ChatHistoryList {...defaultProps} threads={[]} />);
    expect(screen.getByText('No chats yet.')).toBeDefined();
  });

  it('hides soft-deleted threads', () => {
    render(<ChatHistoryList {...defaultProps} threads={[THREAD_DELETED, THREAD_A]} />);
    const rows = screen.getAllByTestId('chat-history-row');
    const ids = rows.map((r) => r.getAttribute('data-thread-id'));
    expect(ids).not.toContain('d');
    expect(ids).toContain('a');
  });

  it('shows pinned threads in the pinned section', () => {
    render(<ChatHistoryList {...defaultProps} threads={[THREAD_A, THREAD_PINNED]} />);
    const pinned = screen.getByTestId('pinned-section');
    expect(pinned.textContent).toContain('Pinned Thread');
  });

  it('unpinned threads do not appear in pinned section', () => {
    render(<ChatHistoryList {...defaultProps} threads={[THREAD_A, THREAD_PINNED]} />);
    const pinned = screen.getByTestId('pinned-section');
    expect(pinned.textContent).not.toContain('Thread A');
  });

  it('groups threads by project when multiple projects exist', () => {
    render(<ChatHistoryList {...defaultProps} threads={[THREAD_A, THREAD_BETA]} />);
    const groups = screen.getAllByTestId('thread-group');
    expect(groups.length).toBe(2);
  });

  it('hides group header when only one project', () => {
    render(<ChatHistoryList {...defaultProps} threads={[THREAD_A, THREAD_B]} />);
    // Only one group, so no group header text should appear
    expect(screen.queryByText('alpha')).toBeNull();
  });

  it('calls onSelectThread with thread id when row is clicked', () => {
    const onSelectThread = vi.fn();
    render(
      <ChatHistoryList {...defaultProps} onSelectThread={onSelectThread} threads={[THREAD_A]} />,
    );
    fireEvent.click(screen.getByTestId('chat-history-row'));
    expect(onSelectThread).toHaveBeenCalledWith('a');
  });

  it('marks the active thread row', () => {
    render(<ChatHistoryList {...defaultProps} threads={[THREAD_A, THREAD_B]} activeThreadId="a" />);
    const rows = screen.getAllByTestId('chat-history-row');
    const activeRow = rows.find((r) => r.getAttribute('data-thread-id') === 'a');
    expect(activeRow?.getAttribute('data-active')).toBe('true');
  });

  it('passes completion indicator state through to rows', () => {
    render(
      <ChatHistoryList
        {...defaultProps}
        threads={[THREAD_A]}
        completionIndicators={{ a: 'unseen' }}
      />,
    );
    expect(screen.getByTestId('chat-history-row').getAttribute('data-completion-indicator')).toBe(
      'unseen',
    );
  });
});
