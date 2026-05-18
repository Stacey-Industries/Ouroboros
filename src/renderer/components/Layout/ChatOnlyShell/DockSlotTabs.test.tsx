/**
 * @vitest-environment jsdom
 *
 * DockSlotTabs.test.tsx — Wave 94 Phase C
 *
 * Verifies per-slot tab strip contract:
 *  - renders one tab per session
 *  - active tab is visually distinguished (aria-selected)
 *  - clicking a tab calls onActivate with correct id
 *  - clicking × calls onClose with correct id
 *  - clicking + New calls onSpawn
 *  - empty session list still renders + New button
 *  - rightControls slot renders supplied nodes
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TerminalSession } from '../../Terminal/TerminalTabs';
import { DockSlotTabs } from './DockSlotTabs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSession(id: string, title: string): TerminalSession {
  return { id, title, status: 'running' };
}

const SESSION_A = makeSession('a1', 'bash');
const SESSION_B = makeSession('b2', 'node');

function renderTabs(
  sessions: TerminalSession[],
  activeSessionId: string | null,
  overrides?: Partial<React.ComponentProps<typeof DockSlotTabs>>,
) {
  const onActivate = vi.fn();
  const onClose = vi.fn();
  const onSpawn = vi.fn();
  render(
    <DockSlotTabs
      slot="primary"
      sessions={sessions}
      activeSessionId={activeSessionId}
      onActivate={onActivate}
      onClose={onClose}
      onSpawn={onSpawn}
      {...overrides}
    />,
  );
  return { onActivate, onClose, onSpawn };
}

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tab rendering
// ---------------------------------------------------------------------------

describe('DockSlotTabs — renders one tab per session', () => {
  it('renders a tab button for each session', () => {
    renderTabs([SESSION_A, SESSION_B], null);
    expect(screen.getByTestId('dock-slot-tab-a1')).toBeTruthy();
    expect(screen.getByTestId('dock-slot-tab-b2')).toBeTruthy();
  });

  it('renders zero tabs when session list is empty', () => {
    renderTabs([], null);
    expect(screen.queryByRole('button', { name: /Tab:/ })).toBeNull();
  });

  it('renders session title text inside the tab', () => {
    renderTabs([SESSION_A], null);
    expect(screen.getByText('bash')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Active tab distinction
// ---------------------------------------------------------------------------

describe('DockSlotTabs — active tab is distinguished', () => {
  it('sets aria-selected=true on the active tab', () => {
    renderTabs([SESSION_A, SESSION_B], 'a1');
    const activeTab = screen.getByTestId('dock-slot-tab-a1');
    expect(activeTab.getAttribute('aria-selected')).toBe('true');
  });

  it('sets aria-selected=false on inactive tabs', () => {
    renderTabs([SESSION_A, SESSION_B], 'a1');
    const inactiveTab = screen.getByTestId('dock-slot-tab-b2');
    expect(inactiveTab.getAttribute('aria-selected')).toBe('false');
  });

  it('no tab is active when activeSessionId is null', () => {
    renderTabs([SESSION_A, SESSION_B], null);
    expect(screen.getByTestId('dock-slot-tab-a1').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('dock-slot-tab-b2').getAttribute('aria-selected')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Tab interaction
// ---------------------------------------------------------------------------

describe('DockSlotTabs — clicking a tab calls onActivate with its id', () => {
  it('calls onActivate(id) when tab is clicked', () => {
    const { onActivate } = renderTabs([SESSION_A, SESSION_B], null);
    fireEvent.click(screen.getByTestId('dock-slot-tab-b2'));
    expect(onActivate).toHaveBeenCalledWith('b2');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});

describe('DockSlotTabs — clicking × calls onClose with its id', () => {
  it('calls onClose(id) when the close button is clicked', () => {
    const { onClose, onActivate } = renderTabs([SESSION_A, SESSION_B], null);
    fireEvent.click(screen.getByTestId('dock-slot-tab-close-a1'));
    expect(onClose).toHaveBeenCalledWith('a1');
    expect(onClose).toHaveBeenCalledTimes(1);
    // Should not also trigger activate
    expect(onActivate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// + New button
// ---------------------------------------------------------------------------

describe('DockSlotTabs — + New button', () => {
  it('renders + New button when sessions exist', () => {
    renderTabs([SESSION_A], 'a1');
    expect(screen.getByTestId('dock-slot-primary-spawn')).toBeTruthy();
  });

  it('renders + New button when session list is empty', () => {
    renderTabs([], null);
    expect(screen.getByTestId('dock-slot-primary-spawn')).toBeTruthy();
  });

  it('calls onSpawn when + New is clicked', () => {
    const { onSpawn } = renderTabs([SESSION_A], null);
    fireEvent.click(screen.getByTestId('dock-slot-primary-spawn'));
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// rightControls slot
// ---------------------------------------------------------------------------

describe('DockSlotTabs — rightControls renders supplied nodes', () => {
  it('renders rightControls content when provided', () => {
    renderTabs([SESSION_A], null, {
      rightControls: <button data-testid="custom-ctrl">▾</button>,
    });
    expect(screen.getByTestId('custom-ctrl')).toBeTruthy();
  });

  it('renders nothing for rightControls when omitted', () => {
    renderTabs([SESSION_A], null);
    expect(screen.queryByTestId('custom-ctrl')).toBeNull();
  });
});
