/**
 * @vitest-environment jsdom
 *
 * DockSlot.test.tsx — Wave 89 Phase 1 + Phase 4c
 *
 * Smoke tests for DockSlot: verifies that each slot renders independently
 * with its own session lifecycle. Deep TerminalManager / xterm behaviour is
 * covered by Terminal-subsystem tests; this suite focuses on the slot
 * contract (slot identity, header presence, session change callback).
 *
 * Phase 4c additions:
 *  - collapsed=true hides terminal surface and shows ▴ (expand) button
 *  - collapsed=false shows ▾ (collapse) button and terminal surface
 *  - onToggleCollapse is called when collapse/expand button is clicked
 *  - + New button is always visible (collapsed and expanded)
 *  - Rec and ✕ buttons hidden when collapsed
 *  - Integration: two slots mounted, clicking ▾ on primary collapses it
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DockSlot } from './DockSlot';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useTerminalSessions — stub with minimal shape so DockSlot renders without PTY
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

// TerminalManager — no xterm in jsdom
vi.mock('../../Terminal/TerminalManager', () => ({
  TerminalManager: ({ slot }: { slot?: string }) => (
    <div data-testid={`terminal-manager-${slot ?? 'default'}`} />
  ),
}));

// ErrorBoundary — pass-through
vi.mock('../../shared/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPrimary(overrides: Partial<React.ComponentProps<typeof DockSlot>> = {}) {
  return render(
    <DockSlot
      slot="primary"
      height={200}
      collapsed={false}
      onToggleCollapse={vi.fn()}
      {...overrides}
    />,
  );
}

function renderSecondary(overrides: Partial<React.ComponentProps<typeof DockSlot>> = {}) {
  return render(
    <DockSlot
      slot="secondary"
      height={140}
      collapsed={false}
      onToggleCollapse={vi.fn()}
      {...overrides}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

describe('DockSlot — primary slot', () => {
  it('renders with data-testid dock-slot-primary', () => {
    renderPrimary();
    expect(screen.getByTestId('dock-slot-primary')).toBeTruthy();
  });

  it('renders the Primary label in the header', () => {
    renderPrimary();
    expect(screen.getByText('Primary')).toBeTruthy();
  });

  it('passes slot="primary" to TerminalManager for SPLIT_TERMINAL_EVENT scoping', () => {
    renderPrimary();
    expect(screen.getByTestId('terminal-manager-primary')).toBeTruthy();
  });

  it('applies the height style from props', () => {
    renderPrimary({ height: 250 });
    const el = screen.getByTestId('dock-slot-primary') as HTMLElement;
    expect(el.style.height).toBe('250px');
  });
});

describe('DockSlot — secondary slot', () => {
  it('renders with data-testid dock-slot-secondary', () => {
    renderSecondary();
    expect(screen.getByTestId('dock-slot-secondary')).toBeTruthy();
  });

  it('renders the Shell label in the header', () => {
    renderSecondary();
    expect(screen.getByText('Shell')).toBeTruthy();
  });

  it('passes slot="secondary" to TerminalManager', () => {
    renderSecondary();
    expect(screen.getByTestId('terminal-manager-secondary')).toBeTruthy();
  });
});

describe('DockSlot — two slots mounted simultaneously', () => {
  it('renders both slots with distinct testids when mounted together', () => {
    render(
      <>
        <DockSlot slot="primary" height={200} collapsed={false} onToggleCollapse={vi.fn()} />
        <DockSlot slot="secondary" height={140} collapsed={false} onToggleCollapse={vi.fn()} />
      </>,
    );
    expect(screen.getByTestId('dock-slot-primary')).toBeTruthy();
    expect(screen.getByTestId('dock-slot-secondary')).toBeTruthy();
  });

  it('calls onActiveSessionChange with null on mount (no session spawned)', () => {
    const primaryCb = vi.fn();
    const secondaryCb = vi.fn();
    render(
      <>
        <DockSlot
          slot="primary"
          height={200}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onActiveSessionChange={primaryCb}
        />
        <DockSlot
          slot="secondary"
          height={140}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onActiveSessionChange={secondaryCb}
        />
      </>,
    );
    expect(primaryCb).toHaveBeenCalledWith(null);
    expect(secondaryCb).toHaveBeenCalledWith(null);
    expect(primaryCb).not.toBe(secondaryCb);
  });
});

// ---------------------------------------------------------------------------
// Phase 4c — collapse affordance
// ---------------------------------------------------------------------------

describe('DockSlot — collapse affordance (Phase 4c)', () => {
  it('shows ▾ collapse button when expanded', () => {
    renderPrimary({ collapsed: false });
    expect(screen.getByLabelText('Collapse slot')).toBeTruthy();
    expect(screen.queryByLabelText('Expand slot')).toBeNull();
  });

  it('shows ▴ expand button when collapsed', () => {
    renderPrimary({ collapsed: true });
    expect(screen.getByLabelText('Expand slot')).toBeTruthy();
    expect(screen.queryByLabelText('Collapse slot')).toBeNull();
  });

  it('calls onToggleCollapse when collapse button is clicked', () => {
    const onToggleCollapse = vi.fn();
    renderPrimary({ collapsed: false, onToggleCollapse });
    fireEvent.click(screen.getByLabelText('Collapse slot'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleCollapse when expand button is clicked', () => {
    const onToggleCollapse = vi.fn();
    renderPrimary({ collapsed: true, onToggleCollapse });
    fireEvent.click(screen.getByLabelText('Expand slot'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('shows terminal surface when not collapsed', () => {
    renderPrimary({ collapsed: false });
    expect(screen.getByTestId('terminal-manager-primary')).toBeTruthy();
  });

  it('hides terminal surface when collapsed', () => {
    renderPrimary({ collapsed: true });
    expect(screen.queryByTestId('terminal-manager-primary')).toBeNull();
  });

  it('always shows + New button regardless of collapsed state', () => {
    const { rerender } = renderPrimary({ collapsed: false });
    expect(screen.getByTestId('dock-slot-primary-spawn')).toBeTruthy();
    rerender(
      <DockSlot slot="primary" height={200} collapsed={true} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByTestId('dock-slot-primary-spawn')).toBeTruthy();
  });

  it('hides Rec and ✕ buttons when collapsed', () => {
    renderPrimary({ collapsed: true });
    expect(screen.queryByLabelText('Start recording')).toBeNull();
    expect(screen.queryByLabelText('Close session')).toBeNull();
  });

  it('shows Rec and ✕ buttons when expanded', () => {
    renderPrimary({ collapsed: false });
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
    expect(screen.getByLabelText('Close session')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Phase 4c — integration: two slots, collapse primary, secondary grows
// ---------------------------------------------------------------------------

describe('DockSlot — integration: collapse primary causes secondary to fill (via parent heights)', () => {
  it('primary collapsed=true receives 28px height from parent, secondary receives expanded height', () => {
    // The parent (ChatWorkbenchTerminalDock via useDockSlotHeights.computeSlotDisplayHeights)
    // computes heights. Here we simulate that by passing explicit heights.
    render(
      <>
        <DockSlot slot="primary" height={28} collapsed={true} onToggleCollapse={vi.fn()} />
        <DockSlot slot="secondary" height={572} collapsed={false} onToggleCollapse={vi.fn()} />
      </>,
    );
    const primary = screen.getByTestId('dock-slot-primary') as HTMLElement;
    const secondary = screen.getByTestId('dock-slot-secondary') as HTMLElement;
    expect(primary.style.height).toBe('28px');
    expect(secondary.style.height).toBe('572px');
    // Primary shows expand button; secondary shows collapse button
    expect(screen.getByLabelText('Expand slot')).toBeTruthy();
    expect(screen.getByLabelText('Collapse slot')).toBeTruthy();
    // Primary has no terminal surface; secondary does
    expect(screen.queryByTestId('terminal-manager-primary')).toBeNull();
    expect(screen.getByTestId('terminal-manager-secondary')).toBeTruthy();
  });

  it('both collapsed: each slot shows 28px header strip with expand button', () => {
    render(
      <>
        <DockSlot slot="primary" height={28} collapsed={true} onToggleCollapse={vi.fn()} />
        <DockSlot slot="secondary" height={28} collapsed={true} onToggleCollapse={vi.fn()} />
      </>,
    );
    const primary = screen.getByTestId('dock-slot-primary') as HTMLElement;
    const secondary = screen.getByTestId('dock-slot-secondary') as HTMLElement;
    expect(primary.style.height).toBe('28px');
    expect(secondary.style.height).toBe('28px');
    const expandButtons = screen.getAllByLabelText('Expand slot');
    expect(expandButtons).toHaveLength(2);
    expect(screen.queryByTestId('terminal-manager-primary')).toBeNull();
    expect(screen.queryByTestId('terminal-manager-secondary')).toBeNull();
  });
});
