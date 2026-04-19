/**
 * @vitest-environment jsdom
 *
 * diffReviewState.stale.test.ts — stale-file detection for diff review.
 *
 * Covers:
 * - MARK_STALE action sets isStale on the matching file
 * - acceptHunk / rejectHunk gate on staleness (PEND_STALE_OP, no IPC)
 * - confirmStaleOp re-invokes the IPC after user confirms
 * - dismissStaleOp clears the pending op without invoking IPC
 * - useStaleFileWatcher dispatches MARK_STALE on file-change events
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { diffReviewReducer } from './diffReviewState';
import {
  executeAcceptHunk,
  executeRejectHunk,
  isFileStale,
  useConfirmStaleOp,
  useStaleFileWatcher,
} from './diffReviewState.stale';
import type { DiffReviewState } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<DiffReviewState> = {}): DiffReviewState {
  return {
    sessionId: 'sess-1',
    snapshotHash: 'abc123',
    projectRoot: '/proj',
    files: [
      {
        filePath: '/proj/src/foo.ts',
        relativePath: 'src/foo.ts',
        status: 'modified',
        hunks: [
          {
            id: 'src/foo.ts:0',
            header: '@@ -1,3 +1,3 @@',
            oldStart: 1,
            oldCount: 3,
            newStart: 1,
            newCount: 3,
            lines: [' a', '-b', '+c'],
            rawPatch: 'diff patch text',
            decision: 'pending',
          },
        ],
      },
    ],
    loading: false,
    error: null,
    lastAcceptedBatch: null,
    staleFiles: [],
    stalePendingOp: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock window.electronAPI
// ---------------------------------------------------------------------------

const mockStageHunk = vi.fn().mockResolvedValue({ success: true });
const mockRevertHunk = vi.fn().mockResolvedValue({ success: true });
let fileChangeCallback: ((change: { type: string; path: string }) => void) | null = null;

beforeEach(() => {
  mockStageHunk.mockClear();
  mockRevertHunk.mockClear();
  fileChangeCallback = null;

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      git: { stageHunk: mockStageHunk, revertHunk: mockRevertHunk },
      files: {
        onFileChange: vi.fn((cb) => {
          fileChangeCallback = cb;
          return () => { fileChangeCallback = null; };
        }),
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Reducer — MARK_STALE
// ---------------------------------------------------------------------------

describe('diffReviewReducer MARK_STALE', () => {
  it('adds the relativePath to staleFiles', () => {
    const state = makeState();
    const next = diffReviewReducer(state, { type: 'MARK_STALE', relativePath: 'src/foo.ts' });
    expect(next?.staleFiles).toContain('src/foo.ts');
  });

  it('is idempotent — does not add duplicates', () => {
    const state = makeState({ staleFiles: ['src/foo.ts'] });
    const next = diffReviewReducer(state, { type: 'MARK_STALE', relativePath: 'src/foo.ts' });
    expect(next?.staleFiles.filter((p) => p === 'src/foo.ts')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Reducer — PEND_STALE_OP / DISMISS_STALE_OP
// ---------------------------------------------------------------------------

describe('diffReviewReducer PEND_STALE_OP / DISMISS_STALE_OP', () => {
  it('sets stalePendingOp on PEND_STALE_OP', () => {
    const state = makeState();
    const op = { kind: 'stage' as const, fileIdx: 0, hunkIdx: 0 };
    const next = diffReviewReducer(state, { type: 'PEND_STALE_OP', op });
    expect(next?.stalePendingOp).toEqual(op);
  });

  it('clears stalePendingOp on DISMISS_STALE_OP', () => {
    const state = makeState({
      stalePendingOp: { kind: 'stage', fileIdx: 0, hunkIdx: 0 },
    });
    const next = diffReviewReducer(state, { type: 'DISMISS_STALE_OP' });
    expect(next?.stalePendingOp).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isFileStale
// ---------------------------------------------------------------------------

describe('isFileStale', () => {
  it('returns false when file is not in staleFiles', () => {
    expect(isFileStale(makeState(), 0)).toBe(false);
  });

  it('returns true when file relativePath is in staleFiles', () => {
    const state = makeState({ staleFiles: ['src/foo.ts'] });
    expect(isFileStale(state, 0)).toBe(true);
  });

  it('returns false for an out-of-range fileIdx', () => {
    const state = makeState({ staleFiles: ['src/foo.ts'] });
    expect(isFileStale(state, 99)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// executeAcceptHunk / executeRejectHunk — direct execution helpers
// ---------------------------------------------------------------------------

describe('executeAcceptHunk', () => {
  it('dispatches SET_DECISION + CAPTURE_BATCH and calls stageHunk', () => {
    const state = makeState();
    const dispatch = vi.fn();
    executeAcceptHunk(state, dispatch, 0, 0);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_DECISION', decision: 'accepted' }),
    );
    expect(mockStageHunk).toHaveBeenCalledWith('/proj', 'diff patch text');
  });

  it('is a no-op when hunk decision is not pending', () => {
    const state = makeState();
    state.files[0].hunks[0].decision = 'accepted';
    const dispatch = vi.fn();
    executeAcceptHunk(state, dispatch, 0, 0);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockStageHunk).not.toHaveBeenCalled();
  });
});

describe('executeRejectHunk', () => {
  it('dispatches SET_DECISION + CAPTURE_BATCH and calls revertHunk', () => {
    const state = makeState();
    const dispatch = vi.fn();
    executeRejectHunk(state, dispatch, 0, 0);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_DECISION', decision: 'rejected' }),
    );
    expect(mockRevertHunk).toHaveBeenCalledWith('/proj', 'diff patch text');
  });
});

// ---------------------------------------------------------------------------
// useConfirmStaleOp
// ---------------------------------------------------------------------------

describe('useConfirmStaleOp', () => {
  it('confirmStaleOp dispatches DISMISS + calls stageHunk for stage op', async () => {
    const state = makeState({
      staleFiles: ['src/foo.ts'],
      stalePendingOp: { kind: 'stage', fileIdx: 0, hunkIdx: 0 },
    });
    const dispatch = vi.fn();

    const { result } = renderHook(() => useConfirmStaleOp(state, dispatch));
    act(() => { result.current.confirmStaleOp(); });

    expect(dispatch).toHaveBeenCalledWith({ type: 'DISMISS_STALE_OP' });
    expect(mockStageHunk).toHaveBeenCalledWith('/proj', 'diff patch text');
  });

  it('confirmStaleOp calls revertHunk for revert op', async () => {
    const state = makeState({
      staleFiles: ['src/foo.ts'],
      stalePendingOp: { kind: 'revert', fileIdx: 0, hunkIdx: 0 },
    });
    const dispatch = vi.fn();

    const { result } = renderHook(() => useConfirmStaleOp(state, dispatch));
    act(() => { result.current.confirmStaleOp(); });

    expect(dispatch).toHaveBeenCalledWith({ type: 'DISMISS_STALE_OP' });
    expect(mockRevertHunk).toHaveBeenCalledWith('/proj', 'diff patch text');
  });

  it('dismissStaleOp dispatches DISMISS_STALE_OP without invoking IPC', () => {
    const state = makeState({
      stalePendingOp: { kind: 'stage', fileIdx: 0, hunkIdx: 0 },
    });
    const dispatch = vi.fn();

    const { result } = renderHook(() => useConfirmStaleOp(state, dispatch));
    act(() => { result.current.dismissStaleOp(); });

    expect(dispatch).toHaveBeenCalledWith({ type: 'DISMISS_STALE_OP' });
    expect(mockStageHunk).not.toHaveBeenCalled();
  });

  it('confirmStaleOp is a no-op when stalePendingOp is null', () => {
    const state = makeState();
    const dispatch = vi.fn();

    const { result } = renderHook(() => useConfirmStaleOp(state, dispatch));
    act(() => { result.current.confirmStaleOp(); });

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockStageHunk).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useStaleFileWatcher
// ---------------------------------------------------------------------------

describe('useStaleFileWatcher', () => {
  it('dispatches MARK_STALE when a tracked file emits a change event', () => {
    const state = makeState();
    const dispatch = vi.fn();

    renderHook(() => useStaleFileWatcher(state, dispatch));

    act(() => {
      fileChangeCallback?.({ type: 'change', path: '/proj/src/foo.ts' });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'MARK_STALE',
      relativePath: 'src/foo.ts',
    });
  });

  it('does not dispatch for untracked files', () => {
    const state = makeState();
    const dispatch = vi.fn();

    renderHook(() => useStaleFileWatcher(state, dispatch));

    act(() => {
      fileChangeCallback?.({ type: 'change', path: '/proj/src/other.ts' });
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch for non-change event types (e.g. add)', () => {
    const state = makeState();
    const dispatch = vi.fn();

    renderHook(() => useStaleFileWatcher(state, dispatch));

    act(() => {
      fileChangeCallback?.({ type: 'add', path: '/proj/src/foo.ts' });
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const state = makeState();
    const dispatch = vi.fn();

    const { unmount } = renderHook(() => useStaleFileWatcher(state, dispatch));
    unmount();

    // After unmount the callback reference should be cleared.
    expect(fileChangeCallback).toBeNull();
  });

  it('is a no-op when state is null', () => {
    const dispatch = vi.fn();
    renderHook(() => useStaleFileWatcher(null, dispatch));
    // No subscription registered → onFileChange not called.
    expect(window.electronAPI.files.onFileChange).not.toHaveBeenCalled();
  });
});
