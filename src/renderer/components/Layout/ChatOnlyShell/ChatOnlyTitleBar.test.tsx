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
  useProject: () => ({
    projectRoot: '/test/project',
    projectName: 'project',
    projectRoots: ['/test/project'],
  }),
}));

const approvalContextMock = vi.hoisted(() => ({
  useApprovalContext: vi.fn(() => ({ pendingCount: 0, requests: [] })),
}));

vi.mock('../../../contexts/ApprovalContext', () => approvalContextMock);

vi.mock('./ChatOnlyHeaderControls', () => ({
  ChatOnlyHeaderControls: () => <div data-testid="header-controls-stub" />,
}));

afterEach(() => cleanup());

function renderTitleBar(props: Partial<React.ComponentProps<typeof ChatOnlyTitleBar>> = {}) {
  return render(<ChatOnlyTitleBar {...defaultProps} {...props} />);
}

const defaultProps = {
  onToggleDrawer: vi.fn(),
  onCycleSidebarMode: vi.fn(),
  sidebarMode: 'pinned' as const,
};

describe('ChatOnlyTitleBar', () => {
  it('does not show the approval pill when there are no pending approvals', () => {
    approvalContextMock.useApprovalContext.mockReturnValue({ pendingCount: 0, requests: [] });
    renderTitleBar();
    expect(screen.queryByTestId('chat-approval-pill')).toBeNull();
  });

  it('shows the approval pill when approvals are pending', () => {
    approvalContextMock.useApprovalContext.mockReturnValue({ pendingCount: 2, requests: [] });
    renderTitleBar();
    expect(screen.getByTestId('chat-approval-pill').textContent).toContain('2 approvals');
  });

  it('renders without throwing', () => {
    const { container } = renderTitleBar();
    expect(container).toBeDefined();
  });

  it('calls onCycleSidebarMode when sidebar cycle button is clicked', () => {
    const onCycleSidebarMode = vi.fn();
    renderTitleBar({ onCycleSidebarMode });
    fireEvent.click(screen.getByTestId('sidebar-cycle-button'));
    expect(onCycleSidebarMode).toHaveBeenCalledOnce();
  });

  it('shows project name', () => {
    renderTitleBar();
    expect(screen.getByText('project')).toBeDefined();
  });

  it('does NOT show Chat Mode badge (removed in Wave 43 Phase C)', () => {
    renderTitleBar();
    expect(screen.queryByText('Chat Mode')).toBeNull();
  });

  it('does NOT show Exit chat mode button in the title bar (moved to View menu)', () => {
    renderTitleBar();
    expect(screen.queryByTitle('Exit chat mode')).toBeNull();
  });

  it('does NOT mount ChatOnlyHeaderControls in title bar (Wave 44 Phase D)', () => {
    renderTitleBar();
    expect(screen.queryByTestId('header-controls-stub')).toBeNull();
  });

  it('has no border-b class on the header element', () => {
    renderTitleBar();
    const header = screen.getByTestId('chat-only-title-bar');
    expect(header.className).not.toContain('border-b');
  });

  it('header element carries the titlebar-drag class (drag surface matches IDE titlebar)', () => {
    renderTitleBar();
    const header = screen.getByTestId('chat-only-title-bar');
    expect(header.className).toContain('titlebar-drag');
  });

  it('sidebar cycle button tooltip reflects pinned mode', () => {
    renderTitleBar({ sidebarMode: 'pinned' });
    const btn = screen.getByTestId('sidebar-cycle-button');
    expect(btn.getAttribute('title')).toContain('pinned');
  });

  it('sidebar cycle button tooltip reflects collapsed mode', () => {
    renderTitleBar({ sidebarMode: 'collapsed' });
    const btn = screen.getByTestId('sidebar-cycle-button');
    expect(btn.getAttribute('title')).toContain('collapsed');
  });

  it('sidebar cycle button tooltip reflects hidden mode', () => {
    renderTitleBar({ sidebarMode: 'hidden' });
    const btn = screen.getByTestId('sidebar-cycle-button');
    expect(btn.getAttribute('title')).toContain('hidden');
  });
});
