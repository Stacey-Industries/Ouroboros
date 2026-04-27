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
    activeSessionId: null,
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

  it('shows the empty state when no sessions or chats', () => {
    renderChats();
    expect(screen.getByText(/no chats yet|loading/i)).toBeDefined();
  });

  it('renders + New session button only when handler provided', () => {
    const onCreateSession = vi.fn();
    renderChats({ onCreateSession });
    expect(screen.getByTestId('inner-chats-new-session')).toBeDefined();
  });

  it('does not render + New session button when handler omitted', () => {
    renderChats();
    expect(screen.queryByTestId('inner-chats-new-session')).toBeNull();
  });

  it('clicking + New session calls the handler', () => {
    const onCreateSession = vi.fn();
    renderChats({ onCreateSession });
    fireEvent.click(screen.getByTestId('inner-chats-new-session'));
    expect(onCreateSession).toHaveBeenCalledOnce();
  });
});
