/**
 * @vitest-environment jsdom
 *
 * useCustomLayoutPersistence.test.ts — Unit tests for layout persistence hook (Wave 28 Phase D).
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetCustomLayout = vi.fn();
const mockSetCustomLayout = vi.fn();
const mockDeleteCustomLayout = vi.fn();

vi.mock('../../../renderer/types/electron', () => ({}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).electronAPI = {
  layout: {
    getCustomLayout: (...args: unknown[]) => mockGetCustomLayout(...args),
    setCustomLayout: (...args: unknown[]) => mockSetCustomLayout(...args),
    deleteCustomLayout: (...args: unknown[]) => mockDeleteCustomLayout(...args),
    promoteToGlobal: vi.fn(),
  },
};

// ─── Subject ──────────────────────────────────────────────────────────────────

import { useCustomLayoutPersistence } from './useCustomLayoutPersistence';

const TREE_A = { kind: 'leaf' as const, slotName: 'editorContent', component: { componentKey: 'editorContent' } };

beforeEach(() => {
  mockGetCustomLayout.mockResolvedValue({ success: true, tree: null });
  mockSetCustomLayout.mockResolvedValue({ success: true });
  mockDeleteCustomLayout.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function flush(ms = 300): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useCustomLayoutPersistence', () => {
  it('loads savedTree on mount when sessionId is present', async () => {
    mockGetCustomLayout.mockResolvedValue({ success: true, tree: TREE_A });
    const { result } = renderHook(() => useCustomLayoutPersistence('session-abc'));
    await waitFor(() => expect(result.current.savedTree).toEqual(TREE_A));
    expect(mockGetCustomLayout).toHaveBeenCalledWith('session-abc');
  });

  it('savedTree is null when no saved layout exists', async () => {
    const { result } = renderHook(() => useCustomLayoutPersistence('session-abc'));
    await waitFor(() => expect(mockGetCustomLayout).toHaveBeenCalled());
    expect(result.current.savedTree).toBeNull();
  });

  it('save() debounces writes — does not call IPC immediately', async () => {
    const { result } = renderHook(() => useCustomLayoutPersistence('session-abc'));
    await waitFor(() => expect(mockGetCustomLayout).toHaveBeenCalled());

    act(() => { result.current.save(TREE_A); });
    expect(mockSetCustomLayout).not.toHaveBeenCalled();

    await flush();
    expect(mockSetCustomLayout).toHaveBeenCalledWith('session-abc', TREE_A);
  });

  it('save() only fires once when called rapidly', async () => {
    const { result } = renderHook(() => useCustomLayoutPersistence('session-abc'));
    await waitFor(() => expect(mockGetCustomLayout).toHaveBeenCalled());

    act(() => {
      result.current.save(TREE_A);
      result.current.save(TREE_A);
      result.current.save(TREE_A);
    });
    await flush();
    expect(mockSetCustomLayout).toHaveBeenCalledTimes(1);
  });

  it('clear() calls deleteCustomLayout and resets savedTree', async () => {
    mockGetCustomLayout.mockResolvedValue({ success: true, tree: TREE_A });
    const { result } = renderHook(() => useCustomLayoutPersistence('session-abc'));
    await waitFor(() => expect(result.current.savedTree).toEqual(TREE_A));

    act(() => { result.current.clear(); });
    await waitFor(() => expect(mockDeleteCustomLayout).toHaveBeenCalledWith('session-abc'));
    expect(result.current.savedTree).toBeNull();
  });

  it('unmount cancels pending debounced save', async () => {
    const { result, unmount } = renderHook(() => useCustomLayoutPersistence('session-abc'));
    await waitFor(() => expect(mockGetCustomLayout).toHaveBeenCalled());

    act(() => { result.current.save(TREE_A); });
    unmount();
    await flush();
    expect(mockSetCustomLayout).not.toHaveBeenCalled();
  });

  it('is a no-op when sessionId is empty', async () => {
    const { result } = renderHook(() => useCustomLayoutPersistence(''));
    expect(result.current.savedTree).toBeNull();
    expect(mockGetCustomLayout).not.toHaveBeenCalled();

    act(() => { result.current.save(TREE_A); });
    await flush();
    expect(mockSetCustomLayout).not.toHaveBeenCalled();
  });

  it('isolates different sessionIds independently', async () => {
    mockGetCustomLayout.mockImplementation((id: string) =>
      Promise.resolve({ success: true, tree: id === 'session-1' ? TREE_A : null }),
    );
    const { result: r1 } = renderHook(() => useCustomLayoutPersistence('session-1'));
    const { result: r2 } = renderHook(() => useCustomLayoutPersistence('session-2'));
    await waitFor(() => expect(r1.current.savedTree).toEqual(TREE_A));
    await waitFor(() => expect(r2.current.savedTree).toBeNull());
  });
});
