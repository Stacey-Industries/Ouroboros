/**
 * @vitest-environment jsdom
 *
 * usePinnedContext.test.ts — Unit tests for the usePinnedContext hook.
 */

import type { PinnedContextItem } from '../types/electron';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePinnedContext } from './usePinnedContext';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<PinnedContextItem> = {}): PinnedContextItem {
  return {
    id: 'item-1',
    type: 'user-file',
    source: '/src/foo.ts',
    title: 'foo.ts',
    content: 'export {}',
    tokens: 4,
    addedAt: 1000,
    ...overrides,
  };
}

// ─── Mock window.electronAPI ──────────────────────────────────────────────────

const mockCleanup = vi.fn();
let capturedOnChangedCb: ((p: { sessionId: string; items: PinnedContextItem[] }) => void) | null =
  null;

const mockList = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockDismiss = vi.fn();
const mockOnChanged = vi.fn((cb: (p: { sessionId: string; items: PinnedContextItem[] }) => void) => {
  capturedOnChangedCb = cb;
  return mockCleanup;
});

function setupElectronAPI(): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      pinnedContext: {
        list: mockList,
        add: mockAdd,
        remove: mockRemove,
        dismiss: mockDismiss,
        onChanged: mockOnChanged,
      },
    },
  });
}

function teardownElectronAPI(): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: undefined,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePinnedContext', () => {
  beforeEach(() => {
    capturedOnChangedCb = null;
    vi.clearAllMocks();
    mockList.mockResolvedValue({ success: true, items: [] });
    mockAdd.mockResolvedValue({ success: true, item: makeItem() });
    mockRemove.mockResolvedValue({ success: true });
    mockDismiss.mockResolvedValue({ success: true });
    setupElectronAPI();
  });

  afterEach(() => {
    cleanup();
    teardownElectronAPI();
  });

  it('subscribes to onChanged on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => usePinnedContext('sess-1'));
    expect(mockOnChanged).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('fetches initial items via list() on mount', async () => {
    const item = makeItem();
    mockList.mockResolvedValueOnce({ success: true, items: [item] });

    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('item-1');
  });

  it('starts with empty items when list returns none', async () => {
    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.items).toEqual([]);
  });

  it('updates items when onChanged fires for matching sessionId', async () => {
    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });

    const newItem = makeItem({ id: 'item-2', title: 'bar.ts' });
    act(() => {
      capturedOnChangedCb?.({ sessionId: 'sess-1', items: [newItem] });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('item-2');
  });

  it('ignores onChanged events for a different sessionId', async () => {
    mockList.mockResolvedValueOnce({ success: true, items: [makeItem()] });
    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });

    act(() => {
      capturedOnChangedCb?.({ sessionId: 'sess-other', items: [] });
    });

    expect(result.current.items).toHaveLength(1);
  });

  it('filters out dismissed items received via onChanged', async () => {
    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });

    const visible = makeItem({ id: 'v', dismissed: false });
    const hidden = makeItem({ id: 'h', dismissed: true });
    act(() => {
      capturedOnChangedCb?.({ sessionId: 'sess-1', items: [visible, hidden] });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('v');
  });

  it('add() calls pinnedContext.add and returns the created item', async () => {
    const created = makeItem({ id: 'new-1' });
    mockAdd.mockResolvedValueOnce({ success: true, item: created });

    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });

    let returned: PinnedContextItem | null = null;
    await act(async () => {
      returned = await result.current.add({
        type: 'user-file', source: '/x.ts', title: 'x.ts', content: '', tokens: 1,
      });
    });

    expect(mockAdd).toHaveBeenCalledWith('sess-1', expect.objectContaining({ title: 'x.ts' }));
    expect(returned).toMatchObject({ id: 'new-1' });
  });

  it('add() returns null when store rejects (cap reached)', async () => {
    mockAdd.mockResolvedValueOnce({ success: false, error: 'cap reached' });

    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });

    let returned: PinnedContextItem | null = makeItem();
    await act(async () => {
      returned = await result.current.add({
        type: 'user-file', source: '/x.ts', title: 'x.ts', content: '', tokens: 1,
      });
    });
    expect(returned).toBeNull();
  });

  it('remove() calls pinnedContext.remove', async () => {
    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.remove('item-1'); });
    expect(mockRemove).toHaveBeenCalledWith('sess-1', 'item-1');
  });

  it('dismiss() calls pinnedContext.dismiss', async () => {
    const { result } = renderHook(() => usePinnedContext('sess-1'));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.dismiss('item-1'); });
    expect(mockDismiss).toHaveBeenCalledWith('sess-1', 'item-1');
  });

  it('returns empty items when sessionId is null', () => {
    const { result } = renderHook(() => usePinnedContext(null));
    expect(result.current.items).toEqual([]);
    expect(mockOnChanged).not.toHaveBeenCalled();
  });

  it('handles missing electronAPI gracefully', () => {
    teardownElectronAPI();
    const { result } = renderHook(() => usePinnedContext('sess-1'));
    expect(result.current.items).toEqual([]);
  });
});
