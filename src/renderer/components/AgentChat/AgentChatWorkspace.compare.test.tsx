/**
 * AgentChatWorkspace.compare.test.tsx — Wave 23 Phase E
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPEN_BRANCH_COMPARE_EVENT } from '../../hooks/appEventNames';
import { BranchCompareModal, useBranchCompare } from './AgentChatWorkspace.compare';

afterEach(cleanup);

// ── BranchCompareView stub ────────────────────────────────────────────────────

vi.mock('./BranchCompareView', () => ({
  BranchCompareView: ({
    leftThreadId,
    rightThreadId,
    onClose,
  }: {
    leftThreadId: string;
    rightThreadId: string;
    onClose: () => void;
  }) => (
    <div data-testid="branch-compare-view">
      <span>{leftThreadId}</span>
      <span>{rightThreadId}</span>
      <button onClick={onClose} aria-label="Close comparison">close</button>
    </div>
  ),
}));

// ── useBranchCompare harness ──────────────────────────────────────────────────

function HarnessCompare(): React.ReactElement {
  const { compareState, closeCompare } = useBranchCompare();
  return (
    <div>
      {compareState ? (
        <div data-testid="compare-open">
          <span data-testid="left">{compareState.leftThreadId}</span>
          <span data-testid="right">{compareState.rightThreadId}</span>
          <button onClick={closeCompare}>close</button>
        </div>
      ) : (
        <div data-testid="compare-closed" />
      )}
    </div>
  );
}

function dispatchCompare(leftThreadId: string, rightThreadId: string): void {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(OPEN_BRANCH_COMPARE_EVENT, { detail: { leftThreadId, rightThreadId } }),
    );
  });
}

// ── Tests: useBranchCompare ───────────────────────────────────────────────────

describe('useBranchCompare', () => {
  it('starts with compareState null', () => {
    render(<HarnessCompare />);
    expect(screen.getByTestId('compare-closed')).toBeTruthy();
  });

  it('sets compareState when OPEN_BRANCH_COMPARE_EVENT fires', () => {
    render(<HarnessCompare />);
    dispatchCompare('left-1', 'right-1');
    expect(screen.getByTestId('compare-open')).toBeTruthy();
    expect(screen.getByTestId('left').textContent).toBe('left-1');
    expect(screen.getByTestId('right').textContent).toBe('right-1');
  });

  it('ignores events missing leftThreadId', () => {
    render(<HarnessCompare />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_BRANCH_COMPARE_EVENT, { detail: { rightThreadId: 'r' } }),
      );
    });
    expect(screen.getByTestId('compare-closed')).toBeTruthy();
  });

  it('ignores events missing rightThreadId', () => {
    render(<HarnessCompare />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_BRANCH_COMPARE_EVENT, { detail: { leftThreadId: 'l' } }),
      );
    });
    expect(screen.getByTestId('compare-closed')).toBeTruthy();
  });

  it('closeCompare resets compareState to null', () => {
    render(<HarnessCompare />);
    dispatchCompare('l', 'r');
    expect(screen.getByTestId('compare-open')).toBeTruthy();
    fireEvent.click(screen.getByText('close'));
    expect(screen.getByTestId('compare-closed')).toBeTruthy();
  });

  it('removes the event listener on unmount', () => {
    const { unmount } = render(<HarnessCompare />);
    unmount();
    // Should not throw after unmount
    dispatchCompare('l', 'r');
  });
});

// ── Tests: BranchCompareModal ─────────────────────────────────────────────────

describe('BranchCompareModal', () => {
  let electronAPIMock: { agentChat: { loadThread: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    electronAPIMock = {
      agentChat: { loadThread: vi.fn().mockResolvedValue({ success: true, thread: null }) },
    };
    Object.defineProperty(window, 'electronAPI', {
      value: electronAPIMock,
      configurable: true,
      writable: true,
    });
  });

  it('renders the overlay wrapper', () => {
    const onClose = vi.fn();
    render(
      <BranchCompareModal
        compareState={{ leftThreadId: 'l', rightThreadId: 'r' }}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('branch-compare-view')).toBeTruthy();
  });

  it('passes leftThreadId and rightThreadId to BranchCompareView', () => {
    render(
      <BranchCompareModal
        compareState={{ leftThreadId: 'thread-a', rightThreadId: 'thread-b' }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('thread-a')).toBeTruthy();
    expect(screen.getByText('thread-b')).toBeTruthy();
  });

  it('calls onClose when BranchCompareView closes', () => {
    const onClose = vi.fn();
    render(
      <BranchCompareModal
        compareState={{ leftThreadId: 'l', rightThreadId: 'r' }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close comparison'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
