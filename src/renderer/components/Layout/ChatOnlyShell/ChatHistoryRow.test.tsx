/**
 * @vitest-environment jsdom
 *
 * ChatHistoryRow — smoke tests (Wave 44 Phase B).
 *
 * Covers:
 *  - Renders title and subtitle.
 *  - onClick fires with thread id.
 *  - Active row has selection class.
 *  - Right-click opens context menu with Delete / Rename / Pin / Archive.
 *  - Delete menu item calls onDelete.
 *  - Rename menu item calls onRename.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../../types/electron';
import { ChatHistoryRow } from './ChatHistoryRow';

afterEach(() => cleanup());

vi.mock('./ChatHistoryStatusDot', () => ({
  ChatHistoryStatusDot: ({ status }: { status: string }) => (
    <span data-testid="status-dot-stub" data-status={status} />
  ),
}));

const BASE_THREAD: AgentChatThreadRecord = {
  version: 1,
  id: 'thread-1',
  workspaceRoot: '/project/alpha',
  createdAt: Date.now() - 3600_000,
  updatedAt: Date.now() - 60_000,
  title: 'Fix the login bug',
  status: 'complete',
  messages: [
    { id: 'm1', threadId: 'thread-1', role: 'user', content: 'Fix the login bug', createdAt: Date.now() - 3600_000 },
    { id: 'm2', threadId: 'thread-1', role: 'assistant', content: 'Done.', createdAt: Date.now() - 3500_000 },
  ],
};

function renderRow(overrides: Partial<ChatHistoryRowProps> = {}) {
  const props: ChatHistoryRowProps = {
    thread: BASE_THREAD,
    isActive: false,
    onClick: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn(),
    ...overrides,
  };
  return { ...render(<ChatHistoryRow {...props} />), props };
}

import type { ChatHistoryRowProps } from './ChatHistoryRow';

describe('ChatHistoryRow', () => {
  it('renders without throwing', () => {
    const { container } = renderRow();
    expect(container).toBeDefined();
  });

  it('displays the thread title', () => {
    renderRow();
    expect(screen.getByText('Fix the login bug')).toBeDefined();
  });

  it('calls onClick with thread id when clicked', () => {
    const onClick = vi.fn();
    renderRow({ onClick });
    fireEvent.click(screen.getByTestId('chat-history-row'));
    expect(onClick).toHaveBeenCalledWith('thread-1');
  });

  it('active row has selection styling class', () => {
    renderRow({ isActive: true });
    expect(screen.getByTestId('chat-history-row').className).toContain('bg-interactive-selection');
  });

  it('inactive row does not have selection class', () => {
    renderRow({ isActive: false });
    expect(screen.getByTestId('chat-history-row').className).not.toContain('bg-interactive-selection');
  });

  it('right-click opens context menu with Pin, Archive, Delete, Rename', () => {
    renderRow();
    fireEvent.contextMenu(screen.getByTestId('chat-history-row'));
    const menu = screen.getByTestId('context-menu');
    expect(menu).toBeDefined();
    expect(menu.textContent).toContain('Pin');
    expect(menu.textContent).toContain('Archive');
    expect(menu.textContent).toContain('Delete');
    expect(menu.textContent).toContain('Rename');
  });

  it('clicking Delete menu item calls onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderRow({ onDelete });
    fireEvent.contextMenu(screen.getByTestId('chat-history-row'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('thread-1');
  });

  it('clicking Rename menu item calls onRename', () => {
    const onRename = vi.fn();
    renderRow({ onRename });
    fireEvent.contextMenu(screen.getByTestId('chat-history-row'));
    fireEvent.click(screen.getByText('Rename'));
    expect(onRename).toHaveBeenCalledWith(BASE_THREAD);
  });

  it('uses branchName over title when present', () => {
    const thread = { ...BASE_THREAD, branchName: 'My custom branch name' };
    renderRow({ thread });
    expect(screen.getByText('My custom branch name')).toBeDefined();
  });

  it('renders status dot stub', () => {
    renderRow();
    expect(screen.getByTestId('status-dot-stub')).toBeDefined();
  });
});
