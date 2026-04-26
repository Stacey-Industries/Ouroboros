/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION_SWITCH_EVENT } from '../../../hooks/appEventNames';
import { WorkbenchRail } from './WorkbenchRail';

vi.mock('./useWorkbenchAttention', () => ({
  useWorkbenchAttention: vi.fn(() => ({
    sessionAttentionById: {},
    chatAttentionById: {},
  })),
}));

vi.mock('./useWorkbenchSessions', () => ({
  useWorkbenchSessions: vi.fn(),
}));

vi.mock('./useWorkbenchRecentChats', () => ({
  useWorkbenchRecentChats: vi.fn(),
}));

import { useWorkbenchRecentChats } from './useWorkbenchRecentChats';
import { useWorkbenchSessions } from './useWorkbenchSessions';

const mockUseWorkbenchSessions = vi.mocked(useWorkbenchSessions);
const mockUseWorkbenchRecentChats = vi.mocked(useWorkbenchRecentChats);

function makeSessionItem(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'session',
    id: 'session-1',
    projectLabel: 'alpha',
    projectRoot: '/workspace/alpha',
    shortId: 'session-',
    lastUsedLabel: '1m ago',
    status: 'active',
    isActive: false,
    isPinned: false,
    isWorktree: false,
    terminalCount: 0,
    chatCount: 1,
    hasConversation: true,
    hasActiveThread: false,
    attention: { kind: 'none', label: null, rank: 0, tone: 'neutral', isSticky: false },
    threadStatus: null,
    linkedThreadId: null,
    rawSession: {
      id: 'session-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-04-22T15:00:00.000Z',
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

function makeRecentChatItem(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'recent-chat',
    id: 'thread-1',
    threadId: 'thread-1',
    projectLabel: 'alpha',
    projectRoot: '/workspace/alpha',
    title: 'Recent chat',
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
      title: 'Recent chat',
      status: 'complete',
      messages: [],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WorkbenchRail', () => {
  it('renders an empty state while loading', () => {
    mockUseWorkbenchSessions.mockReturnValue({
      items: [],
      activeItems: [],
      backgroundItems: [],
      activeSessionId: null,
      isLoading: true,
      refresh: vi.fn(),
    });
    mockUseWorkbenchRecentChats.mockReturnValue({ items: [] });

    render(<WorkbenchRail />);
    expect(screen.getByText('Loading workbench…')).toBeTruthy();
  });

  it('renders grouped active, background, and recent-chat sections', () => {
    mockUseWorkbenchSessions.mockReturnValue({
      items: [
        makeSessionItem({ id: 'active', isActive: true, projectLabel: 'active-project' }),
        makeSessionItem({ id: 'background', projectLabel: 'background-project' }),
      ],
      activeItems: [
        makeSessionItem({ id: 'active', isActive: true, projectLabel: 'active-project' }),
      ],
      backgroundItems: [makeSessionItem({ id: 'background', projectLabel: 'background-project' })],
      activeSessionId: 'active',
      isLoading: false,
      refresh: vi.fn(),
    });
    mockUseWorkbenchRecentChats.mockReturnValue({
      items: [makeRecentChatItem({ id: 'thread-2', title: 'Recent rescue chat' })],
    });

    render(<WorkbenchRail onCreateSession={vi.fn()} />);

    expect(screen.getByTestId('workbench-section-active-sessions')).toBeTruthy();
    expect(screen.getByTestId('workbench-section-background-sessions')).toBeTruthy();
    expect(screen.getByTestId('workbench-section-recent-chats')).toBeTruthy();
    expect(screen.getByText('active-project')).toBeTruthy();
    expect(screen.getByText('background-project')).toBeTruthy();
    expect(screen.getByText('Recent rescue chat')).toBeTruthy();
    expect(screen.getByText('2 sessions · 1 chat')).toBeTruthy();
  });

  it('uses onSelectSession when supplied and keeps recent-chat selection separate', () => {
    const onSelectSession = vi.fn();
    const onSelectRecentChat = vi.fn();
    mockUseWorkbenchSessions.mockReturnValue({
      items: [makeSessionItem()],
      activeItems: [makeSessionItem({ isActive: true })],
      backgroundItems: [],
      activeSessionId: 'session-1',
      isLoading: false,
      refresh: vi.fn(),
    });
    mockUseWorkbenchRecentChats.mockReturnValue({
      items: [makeRecentChatItem()],
    });

    render(
      <WorkbenchRail onSelectSession={onSelectSession} onSelectRecentChat={onSelectRecentChat} />,
    );

    const rows = screen.getAllByTestId('workbench-session-row');
    fireEvent.click(rows[0]);
    fireEvent.keyDown(rows[1], { key: 'Enter' });

    expect(onSelectSession).toHaveBeenCalledWith('session-1');
    expect(onSelectRecentChat).toHaveBeenCalledWith('thread-1');
  });

  it('dispatches SESSION_SWITCH_EVENT when no session handler is supplied', () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_SWITCH_EVENT, listener as EventListener);
    mockUseWorkbenchSessions.mockReturnValue({
      items: [makeSessionItem()],
      activeItems: [makeSessionItem({ isActive: true })],
      backgroundItems: [],
      activeSessionId: 'session-1',
      isLoading: false,
      refresh: vi.fn(),
    });
    mockUseWorkbenchRecentChats.mockReturnValue({ items: [] });

    render(<WorkbenchRail />);
    fireEvent.click(screen.getByTestId('workbench-session-row'));

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{ sessionId: string }>;
    expect(event.detail.sessionId).toBe('session-1');
    window.removeEventListener(SESSION_SWITCH_EVENT, listener as EventListener);
  });

  it('forwards compare requests for eligible background sessions', () => {
    const onCompareSession = vi.fn();
    mockUseWorkbenchSessions.mockReturnValue({
      items: [makeSessionItem({ id: 'session-2', linkedThreadId: 'thread-2' })],
      activeItems: [],
      backgroundItems: [makeSessionItem({ id: 'session-2', linkedThreadId: 'thread-2' })],
      activeSessionId: 'session-1',
      isLoading: false,
      refresh: vi.fn(),
    });
    mockUseWorkbenchRecentChats.mockReturnValue({ items: [] });

    render(
      <WorkbenchRail
        onCompareSession={onCompareSession}
        canCompareSession={() => true}
        compareSessionId={null}
      />,
    );

    fireEvent.click(screen.getByTestId('workbench-session-compare'));
    expect(onCompareSession).toHaveBeenCalledWith('session-2');
  });

  it('calls onLaunchAgent when "Launch agent" is clicked and does NOT call onCreateSession', () => {
    const onCreateSession = vi.fn();
    const onLaunchAgent = vi.fn();
    mockUseWorkbenchSessions.mockReturnValue({
      items: [],
      activeItems: [],
      backgroundItems: [],
      activeSessionId: null,
      isLoading: false,
      refresh: vi.fn(),
    });
    mockUseWorkbenchRecentChats.mockReturnValue({ items: [] });

    render(<WorkbenchRail onCreateSession={onCreateSession} onLaunchAgent={onLaunchAgent} />);

    fireEvent.click(screen.getByText('Launch agent'));
    expect(onLaunchAgent).toHaveBeenCalledOnce();
    expect(onCreateSession).not.toHaveBeenCalled();
  });

  it('calls onCreateSession when "New session" is clicked and does NOT call onLaunchAgent', () => {
    const onCreateSession = vi.fn();
    const onLaunchAgent = vi.fn();
    mockUseWorkbenchSessions.mockReturnValue({
      items: [],
      activeItems: [],
      backgroundItems: [],
      activeSessionId: null,
      isLoading: false,
      refresh: vi.fn(),
    });
    mockUseWorkbenchRecentChats.mockReturnValue({ items: [] });

    render(<WorkbenchRail onCreateSession={onCreateSession} onLaunchAgent={onLaunchAgent} />);

    fireEvent.click(screen.getByText('New session'));
    expect(onCreateSession).toHaveBeenCalledOnce();
    expect(onLaunchAgent).not.toHaveBeenCalled();
  });
});
