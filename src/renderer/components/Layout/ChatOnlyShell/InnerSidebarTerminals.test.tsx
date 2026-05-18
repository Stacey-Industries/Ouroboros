/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SlotHandle } from '../../../hooks/useProjectTerminals';
import { InnerSidebarTerminals } from './InnerSidebarTerminals';

// Mock the context
vi.mock('../../../contexts/ProjectTerminalsContext', () => ({
  useProjectTerminalsContext: vi.fn(),
}));

import { useProjectTerminalsContext } from '../../../contexts/ProjectTerminalsContext';

afterEach(cleanup);

function makeSlotHandle(overrides: Partial<SlotHandle> = {}): SlotHandle {
  return {
    sessions: [],
    activeSessionId: null,
    setActiveSessionId: vi.fn(),
    recordingSessions: new Set(),
    spawnSession: vi.fn().mockResolvedValue(undefined),
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
  beforeEach(() => {
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary: makeSlotHandle(),
      secondary: makeSlotHandle(),
    });
  });

  it('renders the terminals container', () => {
    render(<InnerSidebarTerminals />);
    expect(screen.getByTestId('inner-sidebar-terminals')).toBeDefined();
  });

  it('shows empty state when both slots have no sessions', () => {
    render(<InnerSidebarTerminals />);
    expect(screen.getByText(/no terminals open/i)).toBeDefined();
  });

  it('renders Primary slot header and sessions', () => {
    const primarySession = { id: 't1', title: 'bash', status: 'running' as const };
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary: makeSlotHandle({
        sessions: [primarySession],
        activeSessionId: 't1',
      }),
      secondary: makeSlotHandle(),
    });

    render(<InnerSidebarTerminals />);
    expect(screen.getByText('Primary')).toBeDefined();
    expect(screen.getByText('bash')).toBeDefined();
  });

  it('renders Shell slot header and sessions', () => {
    const shellSession = { id: 't2', title: 'node', status: 'running' as const };
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary: makeSlotHandle(),
      secondary: makeSlotHandle({
        sessions: [shellSession],
        activeSessionId: 't2',
      }),
    });

    render(<InnerSidebarTerminals />);
    expect(screen.getByText('Shell')).toBeDefined();
    expect(screen.getByText('node')).toBeDefined();
  });

  it('does not render slot header when slot is empty', () => {
    const primarySession = { id: 't1', title: 'bash', status: 'running' as const };
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary: makeSlotHandle({
        sessions: [primarySession],
      }),
      secondary: makeSlotHandle(),
    });

    render(<InnerSidebarTerminals />);
    expect(screen.getByText('Primary')).toBeDefined();
    expect(screen.queryByText('Shell')).toBeNull();
  });

  it('clicking a primary session activates it', () => {
    const primary = makeSlotHandle({
      sessions: [{ id: 't1', title: 'bash', status: 'running' as const }],
    });
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary,
      secondary: makeSlotHandle(),
    });

    const onActivateInDock = vi.fn();
    render(<InnerSidebarTerminals onActivateInDock={onActivateInDock} />);
    fireEvent.click(screen.getByText('bash'));
    expect(primary.setActiveSessionId).toHaveBeenCalledWith('t1');
    expect(onActivateInDock).toHaveBeenCalledOnce();
  });

  it('clicking a secondary session activates it', () => {
    const secondary = makeSlotHandle({
      sessions: [{ id: 't2', title: 'node', status: 'running' as const }],
    });
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary: makeSlotHandle(),
      secondary,
    });

    const onActivateInDock = vi.fn();
    render(<InnerSidebarTerminals onActivateInDock={onActivateInDock} />);
    fireEvent.click(screen.getByText('node'));
    expect(secondary.setActiveSessionId).toHaveBeenCalledWith('t2');
    expect(onActivateInDock).toHaveBeenCalledOnce();
  });

  it('+ New terminal spawns in primary slot by default', () => {
    const primary = makeSlotHandle();
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary,
      secondary: makeSlotHandle(),
    });

    const onActivateInDock = vi.fn();
    render(<InnerSidebarTerminals onActivateInDock={onActivateInDock} />);
    fireEvent.click(screen.getByTestId('inner-terminals-new'));
    expect(primary.spawnSession).toHaveBeenCalledOnce();
    expect(onActivateInDock).toHaveBeenCalledOnce();
  });

  it('right-click on + New shows context menu', () => {
    const primary = makeSlotHandle();
    const secondary = makeSlotHandle();
    vi.mocked(useProjectTerminalsContext).mockReturnValue({ primary, secondary });

    render(<InnerSidebarTerminals />);
    const newBtn = screen.getByTestId('inner-terminals-new');
    fireEvent.contextMenu(newBtn);
    expect(screen.getByTestId('inner-terminals-context-menu')).toBeDefined();
    expect(screen.getByText('New in Primary')).toBeDefined();
    expect(screen.getByText('New in Shell')).toBeDefined();
  });

  it('context menu "New in Primary" spawns in primary slot', () => {
    const primary = makeSlotHandle();
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary,
      secondary: makeSlotHandle(),
    });

    render(<InnerSidebarTerminals />);
    fireEvent.contextMenu(screen.getByTestId('inner-terminals-new'));
    fireEvent.click(screen.getByTestId('inner-terminals-new-primary'));
    expect(primary.spawnSession).toHaveBeenCalledOnce();
  });

  it('context menu "New in Shell" spawns in secondary slot', () => {
    const secondary = makeSlotHandle();
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary: makeSlotHandle(),
      secondary,
    });

    render(<InnerSidebarTerminals />);
    fireEvent.contextMenu(screen.getByTestId('inner-terminals-new'));
    fireEvent.click(screen.getByTestId('inner-terminals-new-secondary'));
    expect(secondary.spawnSession).toHaveBeenCalledOnce();
  });

  it('closing a primary session calls handleTerminalClose', () => {
    const primary = makeSlotHandle({
      sessions: [{ id: 't1', title: 'bash', status: 'running' as const }],
    });
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary,
      secondary: makeSlotHandle(),
    });

    render(<InnerSidebarTerminals />);
    fireEvent.click(screen.getByTestId('inner-terminals-row-close'));
    expect(primary.handleTerminalClose).toHaveBeenCalledWith('t1');
  });

  it('active session is highlighted', () => {
    const primary = makeSlotHandle({
      sessions: [
        { id: 't1', title: 'bash', status: 'running' as const },
        { id: 't2', title: 'node', status: 'running' as const },
      ],
      activeSessionId: 't2',
    });
    vi.mocked(useProjectTerminalsContext).mockReturnValue({
      primary,
      secondary: makeSlotHandle(),
    });

    render(<InnerSidebarTerminals />);
    const rows = screen.getAllByTestId('inner-terminals-row');
    expect(rows[1].className).toContain('bg-interactive-selection');
  });
});
