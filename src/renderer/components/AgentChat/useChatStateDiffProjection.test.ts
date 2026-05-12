// @vitest-environment jsdom
/**
 * useChatStateDiffProjection.test.ts — Unit tests for the new-path renderer
 * projection hook.
 *
 * Tests:
 *   - initial state is INITIAL_PROJECTION
 *   - snapshot push hydrates state
 *   - text_appended diff accumulates text
 *   - status_changed diff updates status
 *   - seq gap detection triggers requestSnapshot
 *   - cleanup unsubscribes all listeners
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockOnSnapshot = vi.fn(() => vi.fn());
const mockOnStateDiff = vi.fn(() => vi.fn());
const mockRequestSnapshot = vi.fn(() =>
  Promise.resolve({
    threadId: 't1',
    status: 'idle',
    accumulatedText: '',
    activeTurnId: undefined,
    seq: 0,
  }),
);

vi.mock('../../hooks/useConfig', () => ({
  useConfig: vi.fn(() => ({
    config: { agentChatSettings: { chatOrchestration: { useNewStateMachine: true } } },
  })),
}));

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    chatStateNewPath: {
      onSnapshot: mockOnSnapshot,
      onStateDiff: mockOnStateDiff,
      requestSnapshot: mockRequestSnapshot,
    },
  },
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { INITIAL_PROJECTION, useChatStateDiffProjection } from './useChatStateDiffProjection';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useChatStateDiffProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSnapshot.mockReturnValue(vi.fn());
    mockOnStateDiff.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns INITIAL_PROJECTION when threadId is null', () => {
    const { result } = renderHook(() => useChatStateDiffProjection(null));
    expect(result.current).toEqual(INITIAL_PROJECTION);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('subscribes to snapshot and diff channels on mount', () => {
    renderHook(() => useChatStateDiffProjection('t1'));
    expect(mockOnSnapshot).toHaveBeenCalledWith('t1', expect.any(Function));
    expect(mockOnStateDiff).toHaveBeenCalledWith('t1', expect.any(Function));
  });

  it('hydrates state when snapshot push arrives', () => {
    let snapshotCb: ((s: unknown) => void) | null = null;
    mockOnSnapshot.mockImplementation((_tid, cb) => {
      snapshotCb = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useChatStateDiffProjection('t1'));
    act(() => {
      snapshotCb?.({
        threadId: 't1',
        status: 'streaming',
        accumulatedText: 'hello',
        activeTurnId: 'turn-1',
        seq: 5,
      });
    });
    expect(result.current.status).toBe('streaming');
    expect(result.current.accumulatedText).toBe('hello');
    expect(result.current.seq).toBe(5);
  });

  it('accumulates text from text_appended diffs', () => {
    let diffCb: ((d: unknown) => void) | null = null;
    mockOnSnapshot.mockImplementation((_tid, cb) => {
      cb({
        threadId: 't1',
        status: 'streaming',
        accumulatedText: 'hi',
        activeTurnId: 'turn-1',
        seq: 1,
      });
      return vi.fn();
    });
    mockOnStateDiff.mockImplementation((_tid, cb) => {
      diffCb = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useChatStateDiffProjection('t1'));
    act(() => {
      diffCb?.({
        type: 'text_appended',
        threadId: 't1',
        turnId: 'turn-1',
        delta: ' world',
        seq: 2,
      });
    });
    expect(result.current.accumulatedText).toBe('hi world');
  });

  it('calls requestSnapshot when a seq gap is detected', () => {
    let diffCb: ((d: unknown) => void) | null = null;
    mockOnSnapshot.mockImplementation((_tid, cb) => {
      cb({
        threadId: 't1',
        status: 'streaming',
        accumulatedText: '',
        activeTurnId: 'turn-1',
        seq: 10,
      });
      return vi.fn();
    });
    mockOnStateDiff.mockImplementation((_tid, cb) => {
      diffCb = cb;
      return vi.fn();
    });

    renderHook(() => useChatStateDiffProjection('t1'));
    act(() => {
      // seq jumps from 10 to 12 — missing 11
      diffCb?.({ type: 'status_changed', threadId: 't1', status: 'idle', seq: 12 });
    });
    expect(mockRequestSnapshot).toHaveBeenCalledWith('t1');
  });

  it('cleans up subscriptions on unmount', () => {
    const unsubSnap = vi.fn();
    const unsubDiff = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubSnap);
    mockOnStateDiff.mockReturnValue(unsubDiff);

    const { unmount } = renderHook(() => useChatStateDiffProjection('t1'));
    unmount();
    expect(unsubSnap).toHaveBeenCalled();
    expect(unsubDiff).toHaveBeenCalled();
  });
});
