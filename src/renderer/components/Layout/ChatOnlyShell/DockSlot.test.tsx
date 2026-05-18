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

// useProjectTerminalsContext — stub with minimal SlotHandle shape so DockSlot
// renders without PTY. Both primary and secondary return the same empty handle.
const stubSlotHandle = {
  sessions: [],
  activeSessionId: null,
  recordingSessions: new Set<string>(),
  spawnSession: vi.fn().mockResolvedValue(undefined),
  handleTerminalClose: vi.fn(),
  handleTerminalRestart: vi.fn().mockResolvedValue(undefined),
  handleTerminalTitleChange: vi.fn(),
  handleToggleRecording: vi.fn().mockResolvedValue(undefined),
  handleSplit: vi.fn().mockResolvedValue(undefined),
  handleCloseSplit: vi.fn(),
  handleTerminalReorder: vi.fn(),
  setActiveSessionId: vi.fn(),
};

vi.mock('../../../contexts/ProjectTerminalsContext', () => ({
  useProjectTerminalsContext: () => ({
    primary: stubSlotHandle,
    secondary: stubSlotHandle,
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

  it('renders the + New spawn button in the empty-state header', () => {
    renderPrimary();
    expect(screen.getByTestId('dock-slot-primary-spawn')).toBeTruthy();
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

  it('renders the + New spawn button in the empty-state header', () => {
    renderSecondary();
    expect(screen.getByTestId('dock-slot-secondary-spawn')).toBeTruthy();
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
    rerender(<DockSlot slot="primary" height={200} collapsed={true} onToggleCollapse={vi.fn()} />);
    expect(screen.getByTestId('dock-slot-primary-spawn')).toBeTruthy();
  });

  it('hides Rec button when collapsed', () => {
    renderPrimary({ collapsed: true });
    expect(screen.queryByLabelText('Start recording')).toBeNull();
  });

  it('shows Rec button when expanded', () => {
    renderPrimary({ collapsed: false });
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Phase C — Decision 5: tab strip vs label header (session-conditional)
// ---------------------------------------------------------------------------

describe('DockSlot — Phase C: empty state renders SlotHeader with spawn button', () => {
  it('renders spawn button and no tab strip when sessions array is empty (primary)', () => {
    renderPrimary();
    expect(screen.getByTestId('dock-slot-primary-spawn')).toBeTruthy();
    expect(screen.queryByTestId('dock-slot-tabs-primary')).toBeNull();
  });

  it('renders spawn button and no tab strip when sessions array is empty (secondary)', () => {
    renderSecondary();
    expect(screen.getByTestId('dock-slot-secondary-spawn')).toBeTruthy();
    expect(screen.queryByTestId('dock-slot-tabs-secondary')).toBeNull();
  });
});

describe('DockSlot — Phase C: has-sessions state renders DockSlotTabs strip', () => {
  it('renders tab strip (dock-slot-tabs-primary) and no legacy label when sessions exist', async () => {
    // Override the module mock for this test via vi.mocked setter
    const ctx = await import('../../../contexts/ProjectTerminalsContext');
    const original = (ctx as unknown as { useProjectTerminalsContext: () => unknown })
      .useProjectTerminalsContext;
    vi.spyOn(ctx, 'useProjectTerminalsContext').mockReturnValue({
      primary: {
        ...stubSlotHandle,
        sessions: [{ id: 'ses-1', title: 'bash', status: 'running' }],
        activeSessionId: 'ses-1',
      },
      secondary: stubSlotHandle,
    });
    renderPrimary();
    expect(screen.getByTestId('dock-slot-tabs-primary')).toBeTruthy();
    expect(screen.queryByText('Primary')).toBeNull();
    vi.spyOn(ctx, 'useProjectTerminalsContext').mockImplementation(original);
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
