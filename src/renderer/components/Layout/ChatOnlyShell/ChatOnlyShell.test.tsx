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

let mockChatWorkbenchFlag = false;
let mockDiffReviewState: {
  loading: boolean;
  files: Array<{ hunks: Array<{ decision: string }> }>;
} | null = null;
const mockOpenReview = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    projectRoot: '/test/project',
    projectName: 'project',
    projectRoots: ['/test/project'],
  }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: mockDiffReviewState, openReview: mockOpenReview }),
}));

vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: () => <div data-testid="agent-chat-workspace">AgentChatWorkspace</div>,
}));

vi.mock('../../../hooks/useGitBranch', () => ({
  useGitBranch: () => ({ branch: 'main' }),
}));

vi.mock('./ChatOnlySessionDrawer', () => ({
  ChatOnlySessionDrawer: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="session-drawer" data-open={String(open)}>
      SessionDrawer
    </div>
  ),
}));

vi.mock('./ChatOnlyDiffOverlay', () => ({
  ChatOnlyDiffOverlay: ({ open }: { open: boolean; onClose: () => void }) => (
    <div data-testid="diff-overlay" data-open={String(open)}>
      DiffOverlay
    </div>
  ),
}));

vi.mock('./ChatOnlyTitleBar', () => ({
  ChatOnlyTitleBar: ({
    onToggleDrawer,
    onCycleSidebarMode,
  }: {
    onToggleDrawer: () => void;
    onCycleSidebarMode: () => void;
    sidebarMode: string;
  }) => (
    <div data-testid="chat-only-title-bar">
      <button onClick={onToggleDrawer}>Toggle Drawer</button>
      <button onClick={onCycleSidebarMode}>Cycle Sidebar</button>
    </div>
  ),
}));

vi.mock('./ChatHistorySidebar', () => ({
  ChatHistorySidebar: ({ mode }: { mode: string }) => (
    <div data-testid="chat-history-sidebar" data-mode={mode} />
  ),
}));

vi.mock('./useChatSidebarMode', () => ({
  useChatSidebarMode: () => ({ mode: 'pinned', cycleMode: vi.fn() }),
}));

vi.mock('./useChatWorkbenchFlag', () => ({
  useChatWorkbenchFlag: () => mockChatWorkbenchFlag,
}));

vi.mock('./ChatWorkbenchShell', () => ({
  ChatWorkbenchShell: () => (
    <div data-testid="chat-workbench-shell">
      <div data-testid="chat-workbench-body" />
    </div>
  ),
}));

vi.mock('./ChatOnlyStatusBar', () => ({
  ChatOnlyStatusBar: ({
    onOpenDiffOverlay,
  }: {
    projectRoot: string | null;
    onOpenDiffOverlay: () => void;
  }) => (
    <div data-testid="chat-only-status-bar">
      <button onClick={onOpenDiffOverlay} data-testid="open-diff-btn">
        Open Diff
      </button>
    </div>
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => cleanup());

describe('ChatOnlyShell', () => {
  afterEach(() => {
    mockChatWorkbenchFlag = false;
    mockDiffReviewState = null;
    mockOpenReview.mockReset();
  });

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

  it('uses a tighter left inset between the sidebar and chat workspace', () => {
    render(<ChatOnlyShell />);
    const frame = screen.getByTestId('chat-only-workspace-frame');
    expect(frame.className).toContain('pl-2');
    expect(frame.className).toContain('lg:pl-3');
    expect(frame.className).toContain('pr-4');
  });

  it('does not contain IDE shell component strings', () => {
    const { container } = render(<ChatOnlyShell />);
    const html = container.innerHTML;
    const forbidden = [
      'TerminalPane',
      'TerminalManager',
      'AgentMonitorPane',
      'AppLayout',
      'InnerAppLayout',
      'CentrePaneConnected',
      'IdeToolBridge',
      'RightSidebarTabs',
    ];
    for (const name of forbidden) {
      expect(html).not.toContain(name);
    }
  });

  it('session drawer is not rendered in pinned/collapsed mode (only in hidden)', () => {
    // useChatSidebarMode is mocked to return 'pinned', so drawer should not render.
    render(<ChatOnlyShell />);
    expect(screen.queryByTestId('session-drawer')).toBeNull();
  });

  it('diff overlay starts closed', () => {
    render(<ChatOnlyShell />);
    const overlay = screen.getByTestId('diff-overlay');
    expect(overlay.getAttribute('data-open')).toBe('false');
  });

  it('opens diff review from the shared full-review event in classic chat-only mode', () => {
    render(<ChatOnlyShell />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-diff-review', {
          detail: {
            sessionId: 'session-1',
            snapshotHash: 'snap-1',
            projectRoot: '/test/project',
            filePaths: ['src/example.ts'],
          },
        }),
      );
    });

    expect(mockOpenReview).toHaveBeenCalledWith('session-1', 'snap-1', '/test/project', [
      'src/example.ts',
    ]);
  });

  it('keeps the diff overlay open while the review state is still loading', () => {
    // Simulate the real reducer sequence: openReview() puts state into
    // loading=true/files=[] before the LOADED action fires. The auto-close
    // effect must NOT close the overlay during that window.
    mockDiffReviewState = { loading: true, files: [] };
    const { rerender } = render(<ChatOnlyShell />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-diff-review', {
          detail: {
            sessionId: 'session-1',
            snapshotHash: 'snap-1',
            projectRoot: '/test/project',
          },
        }),
      );
    });

    // Loading state — overlay must stay open even though pendingDiffCount is 0.
    rerender(<ChatOnlyShell />);
    expect(screen.getByTestId('diff-overlay').getAttribute('data-open')).toBe('true');

    // Finished loading with no pending hunks — overlay may auto-close now.
    act(() => {
      mockDiffReviewState = { loading: false, files: [] };
    });
    rerender(<ChatOnlyShell />);
    expect(screen.getByTestId('diff-overlay').getAttribute('data-open')).toBe('false');
  });

  it('renders the workbench scaffold when chatWorkbench is enabled', () => {
    mockChatWorkbenchFlag = true;
    render(<ChatOnlyShell />);
    expect(screen.getByTestId('chat-workbench-shell')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-body')).toBeDefined();
    expect(screen.queryByTestId('chat-history-sidebar')).toBeNull();
  });

  it('loads diff review from the shared full-review event in workbench mode without opening the overlay', () => {
    mockChatWorkbenchFlag = true;
    render(<ChatOnlyShell />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-diff-review', {
          detail: {
            sessionId: 'session-2',
            snapshotHash: 'snap-2',
            projectRoot: '/test/project',
          },
        }),
      );
    });

    expect(mockOpenReview).toHaveBeenCalledWith('session-2', 'snap-2', '/test/project', undefined);
    expect(screen.queryByTestId('diff-overlay')).toBeNull();
  });
});
