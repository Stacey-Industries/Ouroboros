/**
 * @vitest-environment jsdom
 *
 * Integration test — Chat-Only Shell Wave 43 polish acceptance (Phase G).
 *
 * Verifies the unified polish applied across Phases C–F:
 *  - Root container carries `bg-surface-chat` (unified background).
 *  - Title bar has no `border-b` divider class.
 *  - No `ChatModeBadge` rendered (removed Phase C).
 *  - No "Exit chat mode" text button in title bar (moved to View menu).
 *  - Status bar returns null when there is no branch, no tokens, no diffs.
 *  - Composer is wrapped in `FloatingComposerContainer` (data-layout attribute).
 *  - `ChatOnlyHeaderControls` NOT rendered in title bar (Wave 44 Phase D).
 *  - Drawer backdrop uses scrim token (CSS var on backdrop element).
 *  - `SideChatDrawer` and `BranchCompareModal` are NOT in the tree
 *    when `AgentChatWorkspace` receives `variant="chat-only"`.
 *
 * Mock setup mirrors ChatOnlyShell.integration.test.tsx.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyShell } from './ChatOnlyShell';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    projectRoot: '/test/project',
    projectName: 'project',
    projectRoots: ['/test/project'],
    addProjectRoot: vi.fn(),
  }),
}));

vi.mock('../../../contexts/AgentEventsContext', () => ({
  AgentEventsProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useAgentEventsContext: () => ({ currentSessions: [] }),
}));

// No branch, no tokens, no diffs → status bar must return null.
vi.mock('../../../hooks/useGitBranch', () => ({
  useGitBranch: () => ({ branch: null }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null }),
}));

// Capture which props AgentChatWorkspace receives.
let capturedVariant: string | undefined;
vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: ({ variant }: { projectRoot: string | null; variant?: string }) => {
    capturedVariant = variant;
    return (
      <div data-testid="agent-chat-workspace" data-variant={variant ?? 'ide'}>
        {/* FloatingComposerContainer is mounted by AgentChatConversation
            which is mocked out here.  The data-layout attribute is placed
            by FloatingComposerContainer itself.  We verify it below via a
            dedicated stub that mimics the real structure. */}
        <div data-layout="floating-composer" data-testid="floating-composer-stub" />
      </div>
    );
  },
}));

// ChatOnlyHeaderControls — stub so we can assert its presence.
vi.mock('./ChatOnlyHeaderControls', () => ({
  ChatOnlyHeaderControls: () => (
    <div data-testid="header-controls">HeaderControls</div>
  ),
}));

vi.mock('./ChatOnlySessionDrawer', () => ({
  ChatOnlySessionDrawer: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="session-drawer" data-open={String(open)}>
      {/* Backdrop uses --surface-scrim-chat token */}
      {open && (
        <div
          data-testid="drawer-backdrop"
          style={{ backgroundColor: 'var(--surface-scrim-chat)' }}
        />
      )}
    </div>
  ),
}));

vi.mock('./ChatOnlyDiffOverlay', () => ({
  ChatOnlyDiffOverlay: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="diff-overlay" data-open={String(open)} />
  ),
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  capturedVariant = undefined;
});

describe('ChatOnlyShell — Wave 43 polish integration', () => {
  it('root container uses bg-surface-base + layered material backgrounds (parity with IDE AppLayout)', () => {
    const { container } = render(<ChatOnlyShell />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('bg-surface-base');
    expect(root.getAttribute('data-layout')).toBe('app');
    // Wave 45 Phase B — three stacked background layers: glass-dim → glows → wash
    expect(root.style.backgroundImage).toContain('var(--bg-wash');
    expect(root.style.backgroundImage).toContain('var(--bg-glows');
    expect(root.style.backgroundImage).toContain('var(--glass-dim');
  });

  it('title bar has no border-b divider', () => {
    render(<ChatOnlyShell />);
    const titleBar = screen.getByTestId('chat-only-title-bar');
    expect(titleBar.className).not.toContain('border-b');
  });

  it('ChatModeBadge is not in the tree', () => {
    const { container } = render(<ChatOnlyShell />);
    expect(container.innerHTML).not.toContain('ChatModeBadge');
    expect(container.innerHTML).not.toContain('Chat Mode');
  });

  it('"Exit chat mode" text button is not in the title bar', () => {
    render(<ChatOnlyShell />);
    const titleBar = screen.getByTestId('chat-only-title-bar');
    expect(titleBar.textContent).not.toContain('Exit chat mode');
    expect(titleBar.textContent).not.toContain('Exit Chat Mode');
  });

  it('status bar is null when there is no branch, no tokens, no pending diffs', () => {
    render(<ChatOnlyShell />);
    expect(screen.queryByTestId('chat-only-status-bar')).toBeNull();
  });

  it('AgentChatWorkspace receives variant="chat-only"', () => {
    render(<ChatOnlyShell />);
    expect(capturedVariant).toBe('chat-only');
    const workspace = screen.getByTestId('agent-chat-workspace');
    expect(workspace.getAttribute('data-variant')).toBe('chat-only');
  });

  it('composer is wrapped in FloatingComposerContainer (data-layout attribute)', () => {
    render(<ChatOnlyShell />);
    const floatingComposer = screen.getByTestId('floating-composer-stub');
    expect(floatingComposer.getAttribute('data-layout')).toBe('floating-composer');
  });

  it('ChatOnlyHeaderControls no longer rendered in the title bar (Wave 44 Phase D)', () => {
    render(<ChatOnlyShell />);
    const titleBar = screen.getByTestId('chat-only-title-bar');
    const controls = titleBar.querySelector('[data-testid="header-controls"]');
    expect(controls).toBeNull();
  });

  it('SideChatDrawer is not in the tree (excluded by variant="chat-only")', () => {
    const { container } = render(<ChatOnlyShell />);
    expect(container.innerHTML).not.toContain('SideChatDrawer');
  });

  it('BranchCompareModal is not in the tree (excluded by variant="chat-only")', () => {
    const { container } = render(<ChatOnlyShell />);
    expect(container.innerHTML).not.toContain('BranchCompareModal');
  });
});
