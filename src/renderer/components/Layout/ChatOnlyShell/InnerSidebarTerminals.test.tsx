/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import type { TerminalSession } from '../../Terminal/TerminalTabs';
import { InnerSidebarTerminals } from './InnerSidebarTerminals';

afterEach(cleanup);

const SESSIONS: TerminalSession[] = [
  { id: 't1', title: 'bash', status: 'running' },
  { id: 't2', title: 'node', status: 'running' },
];

function makeTerminal(overrides: Partial<UseTerminalSessionsReturn> = {}): UseTerminalSessionsReturn {
  return {
    sessions: SESSIONS,
    activeSessionId: 't1',
    setActiveSessionId: vi.fn(),
    recordingSessions: new Set(),
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
    ...overrides,
  };
}

describe('InnerSidebarTerminals', () => {
  it('renders the terminals container', () => {
    render(<InnerSidebarTerminals />);
    expect(screen.getByTestId('inner-sidebar-terminals')).toBeDefined();
  });

  it('shows unavailable message when no terminal API provided', () => {
    render(<InnerSidebarTerminals />);
    expect(screen.getByText(/not available/i)).toBeDefined();
  });

  it('does not show + New terminal button without terminal API', () => {
    render(<InnerSidebarTerminals />);
    expect(screen.queryByTestId('inner-terminals-new')).toBeNull();
  });

  it('shows empty state when terminal API has no sessions', () => {
    render(<InnerSidebarTerminals terminal={makeTerminal({ sessions: [] })} />);
    expect(screen.getByText(/no terminals open/i)).toBeDefined();
  });

  it('renders one row per terminal session', () => {
    render(<InnerSidebarTerminals terminal={makeTerminal()} />);
    expect(screen.getAllByTestId('inner-terminals-row')).toHaveLength(2);
    expect(screen.getByText('bash')).toBeDefined();
    expect(screen.getByText('node')).toBeDefined();
  });

  it('clicking a row activates the session and opens the dock', () => {
    const term = makeTerminal();
    const onActivateInDock = vi.fn();
    render(<InnerSidebarTerminals terminal={term} onActivateInDock={onActivateInDock} />);
    fireEvent.click(screen.getByText('node'));
    expect(term.setActiveSessionId).toHaveBeenCalledWith('t2');
    expect(onActivateInDock).toHaveBeenCalledOnce();
  });

  it('+ New terminal spawns a session and opens the dock', () => {
    const term = makeTerminal();
    const onActivateInDock = vi.fn();
    render(<InnerSidebarTerminals terminal={term} onActivateInDock={onActivateInDock} />);
    fireEvent.click(screen.getByTestId('inner-terminals-new'));
    expect(term.spawnSession).toHaveBeenCalledOnce();
    expect(onActivateInDock).toHaveBeenCalledOnce();
  });
});
