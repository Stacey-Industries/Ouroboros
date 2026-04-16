/**
 * AgentChatTabBar.test.tsx — Wave 23 Phase B (lint refactor)
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../types/electron';
import { AgentChatTabBar } from './AgentChatTabBar';

afterEach(cleanup);

// jsdom does not implement scrollIntoView or scrollLeft mutation
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    id: 'thread-1',
    title: 'Thread 1',
    version: 1,
    workspaceRoot: '/project',
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    messages: [],
    ...overrides,
  } as AgentChatThreadRecord;
}

function setupElectronApi(): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: {
        listBranches: vi.fn().mockResolvedValue({ success: true, branches: [] }),
        getLinkedSession: vi.fn().mockResolvedValue({ success: true, sessionId: null }),
      },
    },
    configurable: true,
    writable: true,
  });
}

beforeEach(setupElectronApi);

describe('AgentChatTabBar', () => {
  it('renders nothing when threads array is empty', () => {
    const { container } = render(
      <AgentChatTabBar
        activeThreadId={null}
        onDeleteThread={vi.fn()}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a tab for each thread', () => {
    const threads = [
      makeThread({ id: 'a', title: 'Chat A' }),
      makeThread({ id: 'b', title: 'Chat B' }),
    ];
    render(
      <AgentChatTabBar
        activeThreadId="a"
        onDeleteThread={vi.fn()}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={threads}
      />,
    );
    expect(screen.getByText('Chat A')).toBeTruthy();
    expect(screen.getByText('Chat B')).toBeTruthy();
  });

  it('calls onNewChat when the + button is clicked', () => {
    const onNewChat = vi.fn();
    render(
      <AgentChatTabBar
        activeThreadId="a"
        onDeleteThread={vi.fn()}
        onNewChat={onNewChat}
        onSelectThread={vi.fn()}
        threads={[makeThread({ id: 'a', title: 'Chat A' })]}
      />,
    );
    fireEvent.click(screen.getByTitle('New chat (Ctrl+L)'));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('calls onSelectThread when a tab is clicked', () => {
    const onSelectThread = vi.fn();
    const threads = [
      makeThread({ id: 'a', title: 'Chat A' }),
      makeThread({ id: 'b', title: 'Chat B' }),
    ];
    render(
      <AgentChatTabBar
        activeThreadId="a"
        onDeleteThread={vi.fn()}
        onNewChat={vi.fn()}
        onSelectThread={onSelectThread}
        threads={threads}
      />,
    );
    fireEvent.click(screen.getByText('Chat B'));
    expect(onSelectThread).toHaveBeenCalledWith('b');
  });

  it('shows the dropdown toggle button when more than one thread', () => {
    const threads = [
      makeThread({ id: 'a', title: 'Chat A' }),
      makeThread({ id: 'b', title: 'Chat B' }),
    ];
    render(
      <AgentChatTabBar
        activeThreadId="a"
        onDeleteThread={vi.fn()}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={threads}
      />,
    );
    expect(screen.getByTitle('Chat history')).toBeTruthy();
  });

  it('does not show the dropdown toggle button when only one thread', () => {
    render(
      <AgentChatTabBar
        activeThreadId="a"
        onDeleteThread={vi.fn()}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[makeThread({ id: 'a', title: 'Chat A' })]}
      />,
    );
    expect(screen.queryByTitle('Chat history')).toBeNull();
  });
});
