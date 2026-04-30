/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./useWorkbenchRailActions', () => ({
  useWorkbenchRailActions: () => ({
    actions: {
      onPin: vi.fn(),
      onUnpin: vi.fn(),
      onArchive: vi.fn(),
      onDelete: vi.fn(),
      onRename: vi.fn(),
    },
  }),
}));

import { InnerSidebarChats, type InnerSidebarChatsProps } from './InnerSidebarChats';

afterEach(cleanup);

function makeProps(overrides: Partial<InnerSidebarChatsProps> = {}): InnerSidebarChatsProps {
  return {
    activeProjectRoot: null,
    activeThreadId: null,
    approvalRequests: [],
    sessions: [],
    threads: [],
    ...overrides,
  };
}

function renderChats(props: Partial<InnerSidebarChatsProps> = {}) {
  return render(<InnerSidebarChats {...makeProps(props)} />);
}

describe('InnerSidebarChats', () => {
  it('renders the inner sidebar chats container', () => {
    renderChats();
    expect(screen.getByTestId('inner-sidebar-chats')).toBeDefined();
  });

  it('shows the no-project prompt when no project is active', () => {
    renderChats();
    expect(screen.getByTestId('inner-chats-no-project')).toBeDefined();
    expect(screen.queryByTestId('inner-chats-new-chat')).toBeNull();
  });

  it('shows the + New chat row when a project is active', () => {
    renderChats({ activeProjectRoot: '/proj/alpha', onCreateChat: vi.fn() });
    expect(screen.getByTestId('inner-chats-new-chat')).toBeDefined();
    expect(screen.queryByTestId('inner-chats-no-project')).toBeNull();
  });

  it('clicking + New chat fires the handler', () => {
    const onCreateChat = vi.fn();
    renderChats({ activeProjectRoot: '/proj/alpha', onCreateChat });
    fireEvent.click(screen.getByTestId('inner-chats-new-chat'));
    expect(onCreateChat).toHaveBeenCalledOnce();
  });

  it('shows the empty chats state when project is active and no chats match', () => {
    renderChats({ activeProjectRoot: '/proj/alpha', threads: [] });
    expect(screen.getByText(/no chats yet/i)).toBeDefined();
  });

  it('lists threads scoped to the active project, most-recent-first', () => {
    const threads = [
      {
        version: 1,
        id: 'thread-old',
        workspaceRoot: '/proj/alpha',
        createdAt: 1,
        updatedAt: 10,
        title: 'Older chat',
        status: 'complete' as const,
        messages: [],
      },
      {
        version: 1,
        id: 'thread-new',
        workspaceRoot: '/proj/alpha',
        createdAt: 1,
        updatedAt: 50,
        title: 'Newer chat',
        status: 'complete' as const,
        messages: [],
      },
      {
        version: 1,
        id: 'thread-other',
        workspaceRoot: '/proj/beta',
        createdAt: 1,
        updatedAt: 99,
        title: 'Other project',
        status: 'complete' as const,
        messages: [],
      },
    ];
    renderChats({ activeProjectRoot: '/proj/alpha', threads });
    const list = screen.getByTestId('inner-chats-list');
    const ids = Array.from(list.children).map((el) =>
      (el as HTMLElement).getAttribute('data-item-id'),
    );
    expect(ids).toEqual(['thread-new', 'thread-old']);
    expect(ids).not.toContain('thread-other');
  });
});
