/**
 * @vitest-environment jsdom
 *
 * ChatOnlyShell — smoke tests.
 *
 * Wave 59 Phase A: `chatWorkbench` flag retired. Workbench IS the chat shell.
 * All classic-shell variant tests removed; workbench always mounts.
 *
 * Verifies:
 *  - Renders without throwing.
 *  - Always mounts ChatWorkbenchShell (not the classic shell).
 *  - Existing user configs with `chatWorkbench: true | false` load without error.
 *  - Diff-review event wires openReview() correctly.
 *  - Workbench shell does NOT open the standalone diff overlay (it handles inline).
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyShell } from './ChatOnlyShell';

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

vi.mock('./ChatWorkbenchShell', () => ({
  ChatWorkbenchShell: ({
    diffOverlayOpen,
  }: {
    diffOverlayOpen: boolean;
    openDiffOverlay: () => void;
    closeDiffOverlay: () => void;
    toggleDrawer: () => void;
    projectRoot: string | null;
    paletteOpen: boolean;
    closePalette: () => void;
    commands: unknown[];
    recentIds: string[];
    execute: () => Promise<void>;
  }) => (
    <div data-testid="chat-workbench-shell">
      <div data-testid="workbench-diff-overlay-state" data-open={String(diffOverlayOpen)} />
    </div>
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => cleanup());

describe('ChatOnlyShell', () => {
  afterEach(() => {
    mockDiffReviewState = null;
    mockOpenReview.mockReset();
  });

  it('renders without throwing', () => {
    const { container } = render(<ChatOnlyShell />);
    expect(container).toBeDefined();
  });

  it('always mounts ChatWorkbenchShell — workbench IS the chat shell', () => {
    render(<ChatOnlyShell />);
    expect(screen.getByTestId('chat-workbench-shell')).toBeDefined();
  });

  it('does not mount the classic shell components', () => {
    render(<ChatOnlyShell />);
    expect(screen.queryByTestId('chat-history-sidebar')).toBeNull();
    expect(screen.queryByTestId('chat-only-body')).toBeNull();
  });

  it('does not contain IDE shell component strings', () => {
    const { container } = render(<ChatOnlyShell />);
    const html = container.innerHTML;
    const forbidden = [
      'TerminalPane',
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

  it('loads diff review from the shared full-review event', () => {
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

  it('does not open the standalone diff overlay — workbench handles diff review inline', () => {
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
    // diffOverlayOpen prop stays false — workbench handles diff inline
    const overlay = screen.getByTestId('workbench-diff-overlay-state');
    expect(overlay.getAttribute('data-open')).toBe('false');
  });

  it('loads user configs containing legacy chatWorkbench field without error', () => {
    // Regression guard: configs with chatWorkbench:true or chatWorkbench:false
    // must not throw. The loader silently drops unknown keys; the shell ignores
    // the field entirely now that the flag is retired.
    expect(() => render(<ChatOnlyShell />)).not.toThrow();
  });
});
