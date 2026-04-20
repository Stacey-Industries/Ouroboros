/**
 * @vitest-environment jsdom
 *
 * ChatOnlyDiffOverlay — open/close, Esc, backdrop, focus, state wiring.
 * Phase D: real useDiffReview mock; backdrop close; auto-close at 0 pending.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
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
  state: MOCK_STATE as typeof MOCK_STATE | null,
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
  mockDiffReview.state = MOCK_STATE;
});

describe('ChatOnlyDiffOverlay', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ChatOnlyDiffOverlay open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when open but state is null', () => {
    mockDiffReview.state = null;
    const { container } = render(<ChatOnlyDiffOverlay open={true} onClose={vi.fn()} />);
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

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    render(<ChatOnlyDiffOverlay open={true} onClose={onClose} />);
    const backdrop = screen.getByTestId('diff-overlay-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the overlay (not backdrop)', () => {
    const onClose = vi.fn();
    render(<ChatOnlyDiffOverlay open={true} onClose={onClose} />);
    const panel = screen.getByTestId('diff-review-panel');
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('has correct ARIA attributes when open', () => {
    render(<ChatOnlyDiffOverlay open={true} onClose={vi.fn()} />);
    const overlay = screen.getByRole('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-label')).toBe('Diff review');
  });

  it('responds to open={false} by not rendering', () => {
    // Covers the auto-close path: parent sets open=false when count hits 0.
    function Wrapper(): React.ReactElement {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => { setOpen(false); }} data-testid="force-close">close</button>
          <ChatOnlyDiffOverlay open={open} onClose={() => { setOpen(false); }} />
        </>
      );
    }
    render(<Wrapper />);
    expect(screen.getByTestId('diff-overlay')).toBeDefined();
    fireEvent.click(screen.getByTestId('force-close'));
    expect(screen.queryByTestId('diff-overlay')).toBeNull();
  });
});
