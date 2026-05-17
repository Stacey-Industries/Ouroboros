/**
 * @vitest-environment jsdom
 *
 * ChatWorkbenchTerminalDock — smoke tests (updated Wave 89 Phase 4c).
 *
 * Wave 89 changes: dock no longer accepts a `terminal` prop — each slot owns
 * its own useTerminalSessions instance. Tests verify the two-slot structure,
 * dock height from useResizable, and resize handle presence.
 *
 * Wave 89 Phase 4c changes: onClose prop removed (dock is permanent in
 * terminal-first mode). DockHeader / DockCloseButton removed. Per-slot
 * collapse affordance (▾/▴) added — covered by DockSlot.test.tsx and
 * the integration test. This suite covers dock-level structure only.
 *
 * Per-slot spawn / session controls are covered by DockSlot.test.tsx.
 * Slot divider drag + persistence round-trip: ChatWorkbenchTerminalDock.stacked.test.tsx.
 */

import { cleanup, render, screen } from '@testing-library/react';
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

// useDockSlotHeights — fixed heights + collapse defaults so tests are deterministic
vi.mock('./useDockSlotHeights', () => ({
  useDockSlotHeights: () => ({
    slotHeights: { primary: 200, secondary: 140 },
    slotsCollapsed: { primary: false, secondary: false },
    toggleSlotCollapsed: vi.fn(),
    buildSiblingOpts: vi.fn().mockReturnValue({
      topPanel: 'leftSidebar',
      bottomPanel: 'rightSidebar',
      parentExtent: 350,
      startSizes: [200, 140],
      startPos: 0,
      direction: 'vertical',
      onCommit: vi.fn(),
    }),
  }),
  computeSlotDisplayHeights: (
    heights: { primary: number; secondary: number },
    _collapsed: unknown,
    _extent: number,
  ) => heights,
  COLLAPSED_HEADER_HEIGHT: 28,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => cleanup());

describe('ChatWorkbenchTerminalDock — two-slot structure', () => {
  it('renders both slot containers', () => {
    render(<ChatWorkbenchTerminalDock />);
    expect(screen.getByTestId('dock-slot-primary')).toBeTruthy();
    expect(screen.getByTestId('dock-slot-secondary')).toBeTruthy();
  });

  it('renders the slot divider between the two slots', () => {
    render(<ChatWorkbenchTerminalDock />);
    expect(screen.getByTestId('dock-slot-divider')).toBeTruthy();
  });

  it('passes slot identity to each TerminalManager instance', () => {
    render(<ChatWorkbenchTerminalDock />);
    expect(screen.getByTestId('terminal-manager-primary')).toBeTruthy();
    expect(screen.getByTestId('terminal-manager-secondary')).toBeTruthy();
  });
});

describe('ChatWorkbenchTerminalDock — dock-level chrome', () => {
  it('dock fills available height via flex-1 (no fixed px height — Phase 4b terminal-first)', () => {
    render(<ChatWorkbenchTerminalDock />);
    const dock = screen.getByTestId('chat-workbench-terminal-dock') as HTMLElement;
    expect(dock.style.height).toBe('');
    expect(dock.className).toContain('flex-1');
  });

  it('does not render the dock-as-whole resize handle (removed in Phase 4b)', () => {
    render(<ChatWorkbenchTerminalDock />);
    expect(screen.queryByTestId('chat-workbench-dock-resize')).toBeNull();
  });

  it('does not render a dock-wide close button (removed in Phase 4c — per-slot collapse replaces it)', () => {
    render(<ChatWorkbenchTerminalDock />);
    expect(screen.queryByTestId('chat-workbench-dock-close')).toBeNull();
  });

  it('renders per-slot collapse buttons (▾) for both slots', () => {
    render(<ChatWorkbenchTerminalDock />);
    // Each slot header has a collapse button with aria-label "Collapse slot"
    const collapseButtons = screen.getAllByLabelText('Collapse slot');
    expect(collapseButtons).toHaveLength(2);
  });
});
