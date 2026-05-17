/**
 * @vitest-environment jsdom
 *
 * ChatWorkbenchTerminalDock — smoke tests (updated Wave 89 Phase 1).
 *
 * Wave 89 changes: dock no longer accepts a `terminal` prop — each slot owns
 * its own useTerminalSessions instance. Tests verify the two-slot structure,
 * close button, dock height from useResizable, and resize handle presence.
 *
 * Per-slot spawn / session controls are covered by DockSlot.test.tsx.
 * Slot divider drag + persistence round-trip: ChatWorkbenchTerminalDock.stacked.test.tsx.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchTerminalDock } from './ChatWorkbenchTerminalDock';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../hooks/useTerminalSessions', () => ({
  useTerminalSessions: () => ({
    sessions: [],
    activeSessionId: null,
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
    setActiveSessionId: vi.fn(),
    focusOrCreateSession: vi.fn(),
  }),
}));

vi.mock('../../Terminal/TerminalManager', () => ({
  TerminalManager: ({ slot }: { slot?: string }) => (
    <div data-testid={`terminal-manager-${slot ?? 'default'}`}>TerminalManager</div>
  ),
}));

vi.mock('../../shared/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../useResizable', () => ({
  useResizable: () => ({
    sizes: { leftSidebar: 220, rightSidebar: 300, terminal: 350 },
    startResize: vi.fn(),
    resetSize: vi.fn(),
    applySizes: vi.fn(),
    startSiblingResize: vi.fn(),
  }),
}));

// useDockSlotHeights — fixed heights so tests are deterministic
vi.mock('./useDockSlotHeights', () => ({
  useDockSlotHeights: () => ({
    slotHeights: { primary: 200, secondary: 140 },
    startSlotDividerDrag: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => cleanup());

describe('ChatWorkbenchTerminalDock — two-slot structure', () => {
  it('renders both slot containers', () => {
    render(<ChatWorkbenchTerminalDock onClose={vi.fn()} />);
    expect(screen.getByTestId('dock-slot-primary')).toBeTruthy();
    expect(screen.getByTestId('dock-slot-secondary')).toBeTruthy();
  });

  it('renders the slot divider between the two slots', () => {
    render(<ChatWorkbenchTerminalDock onClose={vi.fn()} />);
    expect(screen.getByTestId('dock-slot-divider')).toBeTruthy();
  });

  it('passes slot identity to each TerminalManager instance', () => {
    render(<ChatWorkbenchTerminalDock onClose={vi.fn()} />);
    expect(screen.getByTestId('terminal-manager-primary')).toBeTruthy();
    expect(screen.getByTestId('terminal-manager-secondary')).toBeTruthy();
  });
});

describe('ChatWorkbenchTerminalDock — dock-level chrome', () => {
  it('invokes onClose when the dock close button is clicked', () => {
    const onClose = vi.fn();
    render(<ChatWorkbenchTerminalDock onClose={onClose} />);
    fireEvent.click(screen.getByTestId('chat-workbench-dock-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dock fills available height via flex-1 (no fixed px height — Phase 4b terminal-first)', () => {
    // Wave 89 Phase 4b: the dock-as-whole resize handle is removed and the
    // fixed `style={{ height: sizes.terminal }}` is gone. The dock uses
    // flex-1 so it fills the dock-main-area container.
    render(<ChatWorkbenchTerminalDock onClose={vi.fn()} />);
    const dock = screen.getByTestId('chat-workbench-terminal-dock') as HTMLElement;
    expect(dock.style.height).toBe('');
    expect(dock.className).toContain('flex-1');
  });

  it('does not render the dock-as-whole resize handle (removed in Phase 4b)', () => {
    // The DockResizeHandle resized the dock against a chat sibling that no
    // longer exists in the terminal-first layout.
    render(<ChatWorkbenchTerminalDock onClose={vi.fn()} />);
    expect(screen.queryByTestId('chat-workbench-dock-resize')).toBeNull();
  });
});
