/**
 * useStepNarration.test.ts — Unit tests for the per-symbol narration hook.
 * @vitest-environment jsdom
 *
 * Wave 85 Phase 3. Uses @testing-library/react renderHook pattern.
 * window.electronAPI.flowTracer.getNarration is mocked — no IPC in tests.
 *
 * Timer pattern: vi.useFakeTimers() + act(()=>advanceTimersByTime) + act(async()=>{})
 * to flush both the setTimeout debounce and the resulting Promise microtasks.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WHY_PLACEHOLDER } from '../../../main/flowTracer/narrationCachePrompt';
import type { Narration, SymbolRef } from '../../../shared/types/flowTracer';
import { useStepNarration } from './useStepNarration';

// ---------------------------------------------------------------------------
// Mock window.electronAPI via vi.stubGlobal (pattern from useFlowPersistence.test.ts)
// ---------------------------------------------------------------------------

const mockGetNarration = vi.fn<
  [SymbolRef],
  Promise<
    | { success: true; narration: Narration | { stale: true } | null }
    | { success: false; error: string }
  >
>();

vi.stubGlobal('window', {
  electronAPI: { flowTracer: { getNarration: mockGetNarration } },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRef(symbol = 'myFn', file = 'src/foo.ts', line = 1): SymbolRef {
  return { symbol, file, line };
}

const CANNED_NARRATION: Narration = {
  what: 'What for myFn.',
  why: WHY_PLACEHOLDER,
  how: 'How for myFn.',
};

/** Fire the debounce timer and flush resulting promises. */
async function fireDebounce(ms = 150): Promise<void> {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    /* flush microtasks */
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  mockGetNarration.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStepNarration', () => {
  it('starts idle when symbolRef is null', () => {
    const { result } = renderHook(() => useStepNarration(null));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('is still idle before debounce fires', () => {
    mockGetNarration.mockResolvedValue({ success: true, narration: CANNED_NARRATION });
    const { result } = renderHook(() => useStepNarration(makeRef()));
    expect(result.current.status).toBe('idle');
  });

  it('reaches ready state with correct narration after debounce', async () => {
    mockGetNarration.mockResolvedValue({ success: true, narration: CANNED_NARRATION });
    const { result } = renderHook(() => useStepNarration(makeRef()));

    await fireDebounce();

    expect(result.current.status).toBe('ready');
    expect((result.current as { status: 'ready'; narration: Narration }).narration).toEqual(
      CANNED_NARRATION,
    );
  });

  it('returns miss status when narration is null (cache miss)', async () => {
    mockGetNarration.mockResolvedValue({ success: true, narration: null });
    const { result } = renderHook(() => useStepNarration(makeRef()));

    await fireDebounce();

    expect(result.current.status).toBe('miss');
  });

  it('returns ready with stale marker when narration is { stale: true }', async () => {
    mockGetNarration.mockResolvedValue({ success: true, narration: { stale: true } });
    const { result } = renderHook(() => useStepNarration(makeRef()));

    await fireDebounce();

    expect(result.current.status).toBe('ready');
    expect((result.current as { status: 'ready'; narration: unknown }).narration).toEqual({
      stale: true,
    });
  });

  it('returns error when IPC returns success: false', async () => {
    mockGetNarration.mockResolvedValue({ success: false, error: 'handler exploded' });
    const { result } = renderHook(() => useStepNarration(makeRef()));

    await fireDebounce();

    expect(result.current.status).toBe('error');
    expect((result.current as { status: 'error'; message: string }).message).toBe(
      'handler exploded',
    );
  });

  it('returns error when IPC rejects', async () => {
    mockGetNarration.mockRejectedValue(new Error('IPC failure'));
    const { result } = renderHook(() => useStepNarration(makeRef()));

    await fireDebounce();

    expect(result.current.status).toBe('error');
    expect((result.current as { status: 'error'; message: string }).message).toBe('IPC failure');
  });

  it('resets to idle when symbolRef becomes null', async () => {
    mockGetNarration.mockResolvedValue({ success: true, narration: CANNED_NARRATION });
    let ref: SymbolRef | null = makeRef();
    const { result, rerender } = renderHook(() => useStepNarration(ref));
    await fireDebounce();
    expect(result.current.status).toBe('ready');

    ref = null;
    rerender();
    expect(result.current.status).toBe('idle');
  });

  it('does not call getNarration before debounce elapses', () => {
    mockGetNarration.mockResolvedValue({ success: true, narration: CANNED_NARRATION });
    renderHook(() => useStepNarration(makeRef()));

    act(() => {
      vi.advanceTimersByTime(100);
    }); // less than 150ms
    expect(mockGetNarration).not.toHaveBeenCalled();
  });

  it('cancels pending debounce when symbolRef changes quickly', async () => {
    mockGetNarration.mockResolvedValue({ success: true, narration: CANNED_NARRATION });
    let ref: SymbolRef | null = makeRef('fnA');
    const { rerender } = renderHook(() => useStepNarration(ref));

    act(() => {
      vi.advanceTimersByTime(100);
    }); // debounce not fired yet
    ref = makeRef('fnB');
    rerender();
    await fireDebounce(150); // debounce fires for fnB only

    expect(mockGetNarration).toHaveBeenCalledTimes(1);
    expect(mockGetNarration).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'fnB' }));
  });
});
