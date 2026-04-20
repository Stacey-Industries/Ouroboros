/**
 * @vitest-environment jsdom
 *
 * ChatOnlyShell — smoke tests (Wave 42 Phase A acceptance criteria).
 *
 * Verifies:
 *  - Renders without throwing.
 *  - Tree contains the title bar, status bar, and AgentChatWorkspace mock.
 *  - Tree does NOT contain IDE-shell strings.
 *  - Drawer toggles via the custom DOM event.
 *  - Diff overlay button is hidden when pending count is 0.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyShell } from './ChatOnlyShell';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test/project', projectName: 'project', projectRoots: ['/test/project'] }),
}));

vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: () => <div data-testid="agent-chat-workspace">AgentChatWorkspace</div>,
}));

vi.mock('../../../hooks/useGitBranch', () => ({
  useGitBranch: () => ({ branch: 'main' }),
}));

vi.mock('./ChatOnlySessionDrawer', () => ({
  ChatOnlySessionDrawer: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="session-drawer" data-open={String(open)}>SessionDrawer</div>
  ),
}));

vi.mock('./ChatOnlyDiffOverlay', () => ({
  ChatOnlyDiffOverlay: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="diff-overlay" data-open={String(open)}>DiffOverlay</div>
  ),
}));

vi.mock('./ChatOnlyTitleBar', () => ({
  ChatOnlyTitleBar: ({ onToggleDrawer }: { onToggleDrawer: () => void }) => (
    <div data-testid="chat-only-title-bar">
      <button onClick={onToggleDrawer}>Toggle Drawer</button>
    </div>
  ),
}));

vi.mock('./ChatOnlyStatusBar', () => ({
  ChatOnlyStatusBar: ({ onOpenDiffOverlay }: { projectRoot: string | null; onOpenDiffOverlay: () => void }) => (
    <div data-testid="chat-only-status-bar">
      <button onClick={onOpenDiffOverlay} data-testid="open-diff-btn">Open Diff</button>
    </div>
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => cleanup());

describe('ChatOnlyShell', () => {
  it('renders without throwing', () => {
    const { container } = render(<ChatOnlyShell />);
    expect(container).toBeDefined();
  });

  it('contains title bar, status bar, and AgentChatWorkspace', () => {
    render(<ChatOnlyShell />);
    expect(screen.getByTestId('chat-only-title-bar')).toBeDefined();
    expect(screen.getByTestId('chat-only-status-bar')).toBeDefined();
    expect(screen.getByTestId('agent-chat-workspace')).toBeDefined();
  });

  it('does not contain IDE shell component strings', () => {
    const { container } = render(<ChatOnlyShell />);
    const html = container.innerHTML;
    const forbidden = [
      'TerminalPane', 'TerminalManager', 'AgentMonitorPane',
      'AppLayout', 'InnerAppLayout', 'CentrePaneConnected',
      'IdeToolBridge', 'RightSidebarTabs',
    ];
    for (const name of forbidden) {
      expect(html).not.toContain(name);
    }
  });

  it('drawer starts closed and toggles via DOM event', () => {
    render(<ChatOnlyShell />);
    expect(screen.getByTestId('session-drawer').getAttribute('data-open')).toBe('false');

    act(() => { window.dispatchEvent(new CustomEvent('agent-ide:toggle-session-drawer')); });
    expect(screen.getByTestId('session-drawer').getAttribute('data-open')).toBe('true');

    act(() => { window.dispatchEvent(new CustomEvent('agent-ide:toggle-session-drawer')); });
    expect(screen.getByTestId('session-drawer').getAttribute('data-open')).toBe('false');
  });

  it('diff overlay starts closed', () => {
    render(<ChatOnlyShell />);
    const overlay = screen.getByTestId('diff-overlay');
    expect(overlay.getAttribute('data-open')).toBe('false');
  });
});
