/**
 * @vitest-environment jsdom
 *
 * ChatOnlyDiffOverlay — open/close, Esc dismiss scaffold tests.
 *
 * Phase A: DiffReviewPanel is mocked. Phase D wires real state.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyDiffOverlay } from './ChatOnlyDiffOverlay';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../DiffReview/DiffReviewPanel', () => ({
  DiffReviewPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="diff-review-panel">
      <button onClick={onClose}>Close Panel</button>
    </div>
  ),
}));

// Minimal DiffReviewState satisfying the non-null guard in ChatOnlyDiffOverlay.
const MOCK_STATE = {
  sessionId: 'test-session',
  snapshotHash: 'abc123',
  projectRoot: '/test',
  files: [],
  loading: false,
  error: null,
  lastAcceptedBatch: null,
  staleFiles: [],
  stalePendingOp: null,
};

const mockDiffReview = {
  state: MOCK_STATE,
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
  useDiffReview: () => mockDiffReview,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatOnlyDiffOverlay', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ChatOnlyDiffOverlay open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the overlay when open and state is non-null', () => {
    render(<ChatOnlyDiffOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('diff-overlay')).toBeDefined();
  });

  it('mounts DiffReviewPanel when open', () => {
    render(<ChatOnlyDiffOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('diff-review-panel')).toBeDefined();
  });

  it('calls onClose when Esc is pressed while open', () => {
    const onClose = vi.fn();
    render(<ChatOnlyDiffOverlay open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Esc when closed', () => {
    const onClose = vi.fn();
    render(<ChatOnlyDiffOverlay open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose and closeReview via panel close button', () => {
    const onClose = vi.fn();
    render(<ChatOnlyDiffOverlay open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close Panel'));
    expect(mockDiffReview.closeReview).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has correct ARIA attributes when open', () => {
    render(<ChatOnlyDiffOverlay open={true} onClose={vi.fn()} />);
    const overlay = screen.getByRole('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-label')).toBe('Diff review');
  });
});
