/**
 * @vitest-environment jsdom
 *
 * ChatWorkbenchTerminalDock — smoke tests (Wave 46 Phase C).
 *
 * Verifies:
 *  - Renders TerminalManager with passed session data.
 *  - Close button invokes onClose.
 *  - Spawn button invokes terminal.spawnSession.
 *  - Height prop is applied to the dock element.
 *  - Resize handle is present for pointer interactions.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchTerminalDock } from './ChatWorkbenchTerminalDock';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';

vi.mock('../../Terminal/TerminalManager', () => ({
  TerminalManager: (props: { sessions: unknown[]; activeSessionId: string | null }) => (
    <div
      data-testid="terminal-manager-mock"
      data-session-count={String(props.sessions.length)}
      data-active-id={props.activeSessionId ?? ''}
    >
      TerminalManager
    </div>
  ),
}));

vi.mock('../../shared/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeTerminal(overrides: Partial<UseTerminalSessionsReturn> = {}): UseTerminalSessionsReturn {
  const base: UseTerminalSessionsReturn = {
    sessions: [],
    activeSessionId: null,
    setActiveSessionId: vi.fn(),
    recordingSessions: new Set<string>(),
    spawnSession: vi.fn().mockResolvedValue(undefined),
    spawnClaudeSession: vi.fn().mockResolvedValue(undefined),
    spawnCodexSession: vi.fn().mockResolvedValue(undefined),
    handleTerminalClose: vi.fn(),
    handleTerminalRestart: vi.fn().mockResolvedValue(undefined),
    handleTerminalTitleChange: vi.fn(),
    handleToggleRecording: vi.fn().mockResolvedValue(undefined),
    handleSplit: vi.fn().mockResolvedValue(undefined),
    handleCloseSplit: vi.fn(),
    handleTerminalReorder: vi.fn(),
  };
  return { ...base, ...overrides };
}

afterEach(() => cleanup());

describe('ChatWorkbenchTerminalDock', () => {
  it('renders TerminalManager with terminal session data', () => {
    const terminal = makeTerminal({
      sessions: [{ id: 's1', title: 'one', status: 'running' }],
      activeSessionId: 's1',
    });
    render(
      <ChatWorkbenchTerminalDock
        terminal={terminal}
        height={240}
        onHeightChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const mock = screen.getByTestId('terminal-manager-mock');
    expect(mock.getAttribute('data-session-count')).toBe('1');
    expect(mock.getAttribute('data-active-id')).toBe('s1');
  });

  it('invokes onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ChatWorkbenchTerminalDock
        terminal={makeTerminal()}
        height={240}
        onHeightChange={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('chat-workbench-dock-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes spawnSession when spawn button is clicked', () => {
    const spawnSession = vi.fn().mockResolvedValue(undefined);
    const terminal = makeTerminal({ spawnSession });
    render(
      <ChatWorkbenchTerminalDock
        terminal={terminal}
        height={240}
        onHeightChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('chat-workbench-dock-spawn'));
    expect(spawnSession).toHaveBeenCalled();
  });

  it('applies clamped height to the dock element', () => {
    render(
      <ChatWorkbenchTerminalDock
        terminal={makeTerminal()}
        height={9999}
        onHeightChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dock = screen.getByTestId('chat-workbench-terminal-dock');
    // Max clamp is 600.
    expect((dock as HTMLElement).style.height).toBe('600px');
  });

  it('renders the resize handle', () => {
    render(
      <ChatWorkbenchTerminalDock
        terminal={makeTerminal()}
        height={240}
        onHeightChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('chat-workbench-dock-resize')).toBeDefined();
  });
});
