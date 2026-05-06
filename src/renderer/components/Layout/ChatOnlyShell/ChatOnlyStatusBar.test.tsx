/**
 * @vitest-environment jsdom
 *
 * ChatOnlyStatusBar — smoke tests (Wave 43 Phase C).
 *
 * Phase C: status bar now returns null when there is nothing to show
 * (no branch, no active streaming, no pending diffs). The border-t is gone.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Wave 82 (post-smoke): branch indicator removed from chat-only status bar.
// useGitBranch is no longer called; left as historical mock (unused) for any
// downstream re-add.

const mockSessions = {
  currentSessions: [] as Array<{ status: string; inputTokens: number; outputTokens: number }>,
};

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => mockSessions,
}));

const mockDiffReviewState = {
  state: null as null | { files: Array<{ hunks: Array<{ decision: string }> }> },
  canRollback: false,
  closeReview: vi.fn(),
  confirmStaleOp: vi.fn(),
  dismissStaleOp: vi.fn(),
  acceptHunk: vi.fn(),
  rejectHunk: vi.fn(),
  acceptAllFile: vi.fn(),
  rejectAllFile: vi.fn(),
  acceptAll: vi.fn(),
  rejectAll: vi.fn(),
  rollback: vi.fn(),
  openReview: vi.fn(),
};

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => mockDiffReviewState,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFiles(pendingPerFile: number[]): Array<{ hunks: Array<{ decision: string }> }> {
  return pendingPerFile.map((count) => ({
    hunks: [...Array.from({ length: count }, () => ({ decision: 'pending' }))],
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockDiffReviewState.state = null;
  mockSessions.currentSessions = [];
});

describe('ChatOnlyStatusBar', () => {
  it('renders without throwing when there is content (pending diffs)', () => {
    mockDiffReviewState.state = { files: makeFiles([1]) };
    const { container } = render(
      <ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />,
    );
    expect(container).toBeDefined();
  });

  it('does NOT show git branch (Wave 82 — removed; file tree owns branch)', () => {
    mockDiffReviewState.state = { files: makeFiles([1]) };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.queryByText('main')).toBeNull();
    expect(screen.queryByText('master')).toBeNull();
  });

  it('returns null (renders nothing) when no streaming, no diffs', () => {
    mockSessions.currentSessions = [];
    mockDiffReviewState.state = null;
    const { container } = render(
      <ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when there is a running session even with no branch', () => {
    mockSessions.currentSessions = [{ status: 'running', inputTokens: 1000, outputTokens: 200 }];
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.getByTestId('chat-only-status-bar')).toBeDefined();
  });

  it('renders when there are pending diffs even with no branch', () => {
    mockDiffReviewState.state = { files: makeFiles([1]) };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.getByTestId('chat-only-status-bar')).toBeDefined();
  });

  it('hides diff button when state is null (no review open)', () => {
    mockDiffReviewState.state = null;
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.queryByTestId('diff-review-button')).toBeNull();
  });

  it('hides diff button when pending count is 0', () => {
    mockDiffReviewState.state = { files: makeFiles([0]) };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.queryByTestId('diff-review-button')).toBeNull();
  });

  it('shows diff button with correct count when N files have pending hunks', () => {
    // 3 files, each with 1 pending hunk → count = 3
    mockDiffReviewState.state = { files: makeFiles([1, 1, 1]) };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    const btn = screen.getByTestId('diff-review-button');
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain('3');
  });

  it('counts only files with at least one pending hunk', () => {
    // file 0: 1 accepted hunk (not pending); file 1: 2 pending hunks → count = 1
    mockDiffReviewState.state = {
      files: [
        { hunks: [{ decision: 'accepted' }] },
        { hunks: [{ decision: 'pending' }, { decision: 'pending' }] },
      ],
    };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    const btn = screen.getByTestId('diff-review-button');
    expect(btn.textContent).toContain('1');
  });

  it('shows singular "diff" label when count is 1', () => {
    mockDiffReviewState.state = { files: makeFiles([1]) };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.getByTestId('diff-review-button').textContent).toBe('1 pending diff');
  });

  it('shows plural "diffs" label when count > 1', () => {
    mockDiffReviewState.state = { files: makeFiles([1, 1]) };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.getByTestId('diff-review-button').textContent).toBe('2 pending diffs');
  });

  it('has no border-t on the footer element (removed in Wave 43 Phase C)', () => {
    // Wave 82 — needs streaming or diffs to render the footer (branch removed).
    mockDiffReviewState.state = { files: makeFiles([1]) };
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    const footer = screen.getByTestId('chat-only-status-bar');
    expect(footer.className).not.toContain('border-t');
  });
});
