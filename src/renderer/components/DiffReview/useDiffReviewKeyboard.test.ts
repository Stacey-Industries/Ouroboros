/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ReviewHunk } from './types';
import { useDiffReviewKeyboard } from './useDiffReviewKeyboard';

function makeHunk(id: string, decision: ReviewHunk['decision'] = 'pending'): ReviewHunk {
  return {
    id,
    header: '@@ -1,1 +1,1 @@',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines: ['+line'],
    rawPatch: '',
    decision,
  };
}

function fireKey(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('useDiffReviewKeyboard', () => {
  const hunks = [makeHunk('h1'), makeHunk('h2'), makeHunk('h3')];

  it('starts with focusedIndex 0', () => {
    const { result } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept: vi.fn(), onReject: vi.fn() }),
    );
    expect(result.current.focusedIndex).toBe(0);
    expect(result.current.focusedHunkId).toBe('h1');
  });

  it('n advances focusedIndex', () => {
    const { result } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept: vi.fn(), onReject: vi.fn() }),
    );
    fireKey('n');
    expect(result.current.focusedIndex).toBe(1);
    expect(result.current.focusedHunkId).toBe('h2');
  });

  it('p retreats focusedIndex', () => {
    const { result } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept: vi.fn(), onReject: vi.fn() }),
    );
    fireKey('n');
    fireKey('p');
    expect(result.current.focusedIndex).toBe(0);
  });

  it('n clamps at last hunk', () => {
    const { result } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept: vi.fn(), onReject: vi.fn() }),
    );
    fireKey('n');
    fireKey('n');
    fireKey('n'); // beyond end
    expect(result.current.focusedIndex).toBe(2);
  });

  it('p clamps at first hunk', () => {
    const { result } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept: vi.fn(), onReject: vi.fn() }),
    );
    fireKey('p'); // already at 0
    expect(result.current.focusedIndex).toBe(0);
  });

  it('a triggers onAccept with focused hunk id', () => {
    const onAccept = vi.fn();
    renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept, onReject: vi.fn() }),
    );
    fireKey('a');
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept).toHaveBeenCalledWith('h1');
  });

  it('r triggers onReject with focused hunk id', () => {
    const onReject = vi.fn();
    renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept: vi.fn(), onReject }),
    );
    fireKey('r');
    expect(onReject).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledWith('h1');
  });

  it('a does not trigger onAccept for already-decided hunk', () => {
    const onAccept = vi.fn();
    const decidedHunks = [makeHunk('h1', 'accepted'), makeHunk('h2')];
    renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks: decidedHunks, onAccept, onReject: vi.fn() }),
    );
    fireKey('a');
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('all keys are ignored when enabled is false', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const { result } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: false, hunks, onAccept, onReject }),
    );
    fireKey('a');
    fireKey('r');
    fireKey('n');
    fireKey('p');
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(result.current.focusedIndex).toBe(0);
  });

  it('keys are ignored when an input element is focused', () => {
    const onAccept = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept, onReject: vi.fn() }),
    );
    fireKey('a');
    expect(onAccept).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('keys are ignored when a textarea is focused', () => {
    const onReject = vi.fn();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept: vi.fn(), onReject }),
    );
    fireKey('r');
    expect(onReject).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('returns focusedHunkId null when hunks is empty', () => {
    const { result } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks: [], onAccept: vi.fn(), onReject: vi.fn() }),
    );
    expect(result.current.focusedHunkId).toBeNull();
  });

  it('unregisters listener on unmount', () => {
    const onAccept = vi.fn();
    const { unmount } = renderHook(() =>
      useDiffReviewKeyboard({ enabled: true, hunks, onAccept, onReject: vi.fn() }),
    );
    unmount();
    fireKey('a');
    expect(onAccept).not.toHaveBeenCalled();
  });
});
