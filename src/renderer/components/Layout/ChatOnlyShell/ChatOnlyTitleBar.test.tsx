/**
 * @vitest-environment jsdom
 *
 * ChatOnlyTitleBar — smoke tests (Wave 43 Phase C / Wave 44 Phase A+B).
 *
 * Phase C changes:
 *  - ChatModeBadge removed (was Wave 42).
 *  - "Exit chat mode" button removed (moved to View menu only).
 *  - ChatOnlyHeaderControls no longer mounted in title bar (Wave 44 Phase D).
 *    Model + permission chips live in ChatStatusChipRow below the composer.
 *
 * Wave 44 Phase A changes:
 *  - "Exit chat mode" icon button restored to the right of the header controls.
 *    It dispatches TOGGLE_IMMERSIVE_CHAT_EVENT and has no text label (icon only).
 *  - WebkitAppRegion: 'drag' moved off <header> onto a flex-1 spacer div.
 *
 * Wave 44 Phase B changes:
 *  - Drawer-toggle replaced by sidebar-mode cycle button (data-testid="sidebar-cycle-button").
 *  - Props: onCycleSidebarMode, sidebarMode added; onToggleDrawer kept for hidden-mode compat.
 *  - Tooltip text reflects current sidebar mode.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyTitleBar } from './ChatOnlyTitleBar';

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test/project', projectName: 'project', projectRoots: ['/test/project'] }),
}));

vi.mock('./ChatOnlyHeaderControls', () => ({
  ChatOnlyHeaderControls: () => <div data-testid="header-controls-stub" />,
}));

afterEach(() => cleanup());

const defaultProps = {
  onToggleDrawer: vi.fn(),
  onCycleSidebarMode: vi.fn(),
  sidebarMode: 'pinned' as const,
};

describe('ChatOnlyTitleBar', () => {
  it('renders without throwing', () => {
    const { container } = render(<ChatOnlyTitleBar {...defaultProps} />);
    expect(container).toBeDefined();
  });

  it('calls onCycleSidebarMode when sidebar cycle button is clicked', () => {
    const onCycleSidebarMode = vi.fn();
    render(<ChatOnlyTitleBar {...defaultProps} onCycleSidebarMode={onCycleSidebarMode} />);
    fireEvent.click(screen.getByTestId('sidebar-cycle-button'));
    expect(onCycleSidebarMode).toHaveBeenCalledOnce();
  });

  it('shows project name', () => {
    render(<ChatOnlyTitleBar {...defaultProps} />);
    expect(screen.getByText('project')).toBeDefined();
  });

  it('does NOT show Chat Mode badge (removed in Wave 43 Phase C)', () => {
    render(<ChatOnlyTitleBar {...defaultProps} />);
    expect(screen.queryByText('Chat Mode')).toBeNull();
  });

  it('shows Exit chat mode icon button (restored in Wave 44 Phase A)', () => {
    render(<ChatOnlyTitleBar {...defaultProps} />);
    expect(screen.getByTitle('Exit chat mode')).toBeDefined();
  });

  it('dispatches TOGGLE_IMMERSIVE_CHAT_EVENT when Exit button is clicked', () => {
    const dispatched: string[] = [];
    const origDispatch = window.dispatchEvent.bind(window);
    vi.spyOn(window, 'dispatchEvent').mockImplementation((evt: Event) => {
      dispatched.push(evt.type);
      return origDispatch(evt);
    });
    render(<ChatOnlyTitleBar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Exit chat mode'));
    expect(dispatched).toContain('agent-ide:toggle-immersive-chat');
    vi.restoreAllMocks();
  });

  it('Exit chat mode button has no visible text label (icon-only)', () => {
    render(<ChatOnlyTitleBar {...defaultProps} />);
    const btn = screen.getByTitle('Exit chat mode');
    expect(btn.textContent?.trim()).toBe('');
  });

  it('does NOT mount ChatOnlyHeaderControls in title bar (Wave 44 Phase D)', () => {
    render(<ChatOnlyTitleBar {...defaultProps} />);
    expect(screen.queryByTestId('header-controls-stub')).toBeNull();
  });

  it('has no border-b class on the header element', () => {
    render(<ChatOnlyTitleBar {...defaultProps} />);
    const header = screen.getByTestId('chat-only-title-bar');
    expect(header.className).not.toContain('border-b');
  });

  it('header element has no WebkitAppRegion drag style (moved to spacer div)', () => {
    render(<ChatOnlyTitleBar {...defaultProps} />);
    const header = screen.getByTestId('chat-only-title-bar');
    expect((header as HTMLElement).style.webkitAppRegion ?? '').not.toBe('drag');
  });

  it('sidebar cycle button tooltip reflects pinned mode', () => {
    render(<ChatOnlyTitleBar {...defaultProps} sidebarMode="pinned" />);
    const btn = screen.getByTestId('sidebar-cycle-button');
    expect(btn.getAttribute('title')).toContain('pinned');
  });

  it('sidebar cycle button tooltip reflects collapsed mode', () => {
    render(<ChatOnlyTitleBar {...defaultProps} sidebarMode="collapsed" />);
    const btn = screen.getByTestId('sidebar-cycle-button');
    expect(btn.getAttribute('title')).toContain('collapsed');
  });

  it('sidebar cycle button tooltip reflects hidden mode', () => {
    render(<ChatOnlyTitleBar {...defaultProps} sidebarMode="hidden" />);
    const btn = screen.getByTestId('sidebar-cycle-button');
    expect(btn.getAttribute('title')).toContain('hidden');
  });
});
