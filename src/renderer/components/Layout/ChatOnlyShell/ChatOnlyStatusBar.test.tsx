/**
 * @vitest-environment jsdom
 *
 * ChatOnlyStatusBar — smoke tests (Phase D: useDiffReview wired).
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useGitBranch', () => ({
  useGitBranch: () => ({ branch: 'main' }),
}));

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({ currentSessions: [], historicalSessions: [] }),
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
    hunks: [
      ...Array.from({ length: count }, () => ({ decision: 'pending' })),
    ],
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockDiffReviewState.state = null;
});

describe('ChatOnlyStatusBar', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />,
    );
    expect(container).toBeDefined();
  });

  it('shows git branch', () => {
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.getByText('main')).toBeDefined();
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
});
