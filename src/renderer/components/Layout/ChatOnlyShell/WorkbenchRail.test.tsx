/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION_SWITCH_EVENT } from '../../../hooks/appEventNames';
import { WorkbenchRail } from './WorkbenchRail';

vi.mock('./useWorkbenchSessions', () => ({
  useWorkbenchSessions: vi.fn(),
}));

import { useWorkbenchSessions } from './useWorkbenchSessions';

const mockUseWorkbenchSessions = vi.mocked(useWorkbenchSessions);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WorkbenchRail', () => {
  it('renders an empty state while loading', () => {
    mockUseWorkbenchSessions.mockReturnValue({
      items: [],
      activeSessionId: null,
      isLoading: true,
      refresh: vi.fn(),
    });

    render(<WorkbenchRail />);
    expect(screen.getByText('Loading sessions…')).toBeTruthy();
  });

  it('renders session rows and create button when provided', () => {
    const onCreateSession = vi.fn();
    mockUseWorkbenchSessions.mockReturnValue({
      items: [
        {
          id: 'session-1',
          projectLabel: 'alpha',
          projectRoot: '/workspace/alpha',
          shortId: 'session-',
          lastUsedLabel: '1m ago',
          status: 'active',
          isActive: true,
          isPinned: false,
          isWorktree: false,
          terminalCount: 0,
          chatCount: 1,
          hasConversation: true,
          hasActiveThread: false,
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
        },
      ],
      activeSessionId: 'session-1',
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<WorkbenchRail onCreateSession={onCreateSession} />);
    expect(screen.getByTestId('workbench-rail')).toBeTruthy();
    expect(screen.getByText('alpha')).toBeTruthy();
    fireEvent.click(screen.getByText('New'));
    expect(onCreateSession).toHaveBeenCalledOnce();
  });

  it('uses onSelectSession when supplied', () => {
    const onSelectSession = vi.fn();
    mockUseWorkbenchSessions.mockReturnValue({
      items: [
        {
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
          chatCount: 0,
          hasConversation: false,
          hasActiveThread: false,
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
        },
      ],
      activeSessionId: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<WorkbenchRail onSelectSession={onSelectSession} />);
    fireEvent.click(screen.getByTestId('workbench-session-row'));
    expect(onSelectSession).toHaveBeenCalledWith('session-1');
  });

  it('dispatches SESSION_SWITCH_EVENT when no select handler is supplied', () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_SWITCH_EVENT, listener as EventListener);
    mockUseWorkbenchSessions.mockReturnValue({
      items: [
        {
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
          chatCount: 0,
          hasConversation: false,
          hasActiveThread: false,
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
        },
      ],
      activeSessionId: null,
      isLoading: false,
      refresh: vi.fn(),
    });

    render(<WorkbenchRail />);
    fireEvent.click(screen.getByTestId('workbench-session-row'));
    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{ sessionId: string }>;
    expect(event.detail.sessionId).toBe('session-1');
    window.removeEventListener(SESSION_SWITCH_EVENT, listener as EventListener);
  });
});
