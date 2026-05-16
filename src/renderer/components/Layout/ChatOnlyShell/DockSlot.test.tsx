/**
 * @vitest-environment jsdom
 *
 * DockSlot.test.tsx — Wave 89 Phase 1
 *
 * Smoke tests for DockSlot: verifies that each slot renders independently
 * with its own session lifecycle. Deep TerminalManager / xterm behaviour is
 * covered by Terminal-subsystem tests; this suite focuses on the slot
 * contract (slot identity, header presence, session change callback).
 */

import { cleanup, render, screen } from '@testing-library/react';
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
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

describe('DockSlot — primary slot', () => {
  it('renders with data-testid dock-slot-primary', () => {
    render(<DockSlot slot="primary" height={200} />);
    expect(screen.getByTestId('dock-slot-primary')).toBeTruthy();
  });

  it('renders the Primary label in the header', () => {
    render(<DockSlot slot="primary" height={200} />);
    expect(screen.getByText('Primary')).toBeTruthy();
  });

  it('passes slot="primary" to TerminalManager for SPLIT_TERMINAL_EVENT scoping', () => {
    render(<DockSlot slot="primary" height={200} />);
    expect(screen.getByTestId('terminal-manager-primary')).toBeTruthy();
  });

  it('applies the height style from props', () => {
    render(<DockSlot slot="primary" height={250} />);
    const el = screen.getByTestId('dock-slot-primary') as HTMLElement;
    expect(el.style.height).toBe('250px');
  });
});

describe('DockSlot — secondary slot', () => {
  it('renders with data-testid dock-slot-secondary', () => {
    render(<DockSlot slot="secondary" height={140} />);
    expect(screen.getByTestId('dock-slot-secondary')).toBeTruthy();
  });

  it('renders the Shell label in the header', () => {
    render(<DockSlot slot="secondary" height={140} />);
    expect(screen.getByText('Shell')).toBeTruthy();
  });

  it('passes slot="secondary" to TerminalManager', () => {
    render(<DockSlot slot="secondary" height={140} />);
    expect(screen.getByTestId('terminal-manager-secondary')).toBeTruthy();
  });
});

describe('DockSlot — two slots mounted simultaneously', () => {
  it('renders both slots with distinct testids when mounted together', () => {
    render(
      <>
        <DockSlot slot="primary" height={200} />
        <DockSlot slot="secondary" height={140} />
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
        <DockSlot slot="primary" height={200} onActiveSessionChange={primaryCb} />
        <DockSlot slot="secondary" height={140} onActiveSessionChange={secondaryCb} />
      </>,
    );
    // Both slots report null active session on initial mount
    expect(primaryCb).toHaveBeenCalledWith(null);
    expect(secondaryCb).toHaveBeenCalledWith(null);
    // Callbacks are independent — each slot's own callback was called
    expect(primaryCb).not.toBe(secondaryCb);
  });
});
