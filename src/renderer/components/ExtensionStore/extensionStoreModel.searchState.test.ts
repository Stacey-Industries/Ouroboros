/**
 * @vitest-environment jsdom
 *
 * Smoke tests for useExtensionStoreSearchState.
 * runExtensionSearch and getExtensionStoreApi are mocked so tests run
 * synchronously without IPC.
 */
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./extensionStoreModel.helpers', () => ({
  getExtensionStoreApi: vi.fn(() => ({})),
  runExtensionSearch: vi.fn(),
}));

import { runExtensionSearch } from './extensionStoreModel.helpers';
import { useExtensionStoreSearchState } from './extensionStoreModel.searchState';

const mockRunSearch = vi.mocked(runExtensionSearch);

function renderSearchState() {
  const setError = vi.fn();
  return renderHook(() => {
    const sourceRef = useRef<'openvsx' | 'marketplace'>('openvsx');
    return useExtensionStoreSearchState({ sourceRef, setError });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useExtensionStoreSearchState', () => {
  it('initialises with empty query and no extensions', () => {
    const { result } = renderSearchState();
    expect(result.current.query).toBe('');
    expect(result.current.extensions).toHaveLength(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.totalSize).toBe(0);
    expect(result.current.offset).toBe(0);
    expect(result.current.categoryFilter).toBeNull();
  });

  it('search() calls runExtensionSearch with current query', () => {
    const { result } = renderSearchState();
    act(() => { result.current.search(); });
    expect(mockRunSearch).toHaveBeenCalledOnce();
    const args = mockRunSearch.mock.calls[0][0];
    expect(args.query).toBe('');
    expect(args.append).toBe(false);
  });

  it('setQuery() updates query state', () => {
    vi.useFakeTimers();
    const { result } = renderSearchState();
    act(() => { result.current.setQuery('react'); });
    expect(result.current.query).toBe('react');
    vi.useRealTimers();
  });

  it('setQuery() debounces the search call', () => {
    vi.useFakeTimers();
    const { result } = renderSearchState();
    act(() => { result.current.setQuery('vue'); });
    expect(mockRunSearch).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(mockRunSearch).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('setCategoryFilter() stores the category and triggers immediate search', () => {
    const { result } = renderSearchState();
    act(() => { result.current.setCategoryFilter('themes'); });
    expect(result.current.categoryFilter).toBe('themes');
    expect(mockRunSearch).toHaveBeenCalledOnce();
    const args = mockRunSearch.mock.calls[0][0];
    expect(args.category).toBe('themes');
  });

  it('resetResults() clears extensions and resets counters', () => {
    const { result } = renderSearchState();
    act(() => { result.current.resetResults(); });
    expect(result.current.extensions).toHaveLength(0);
    expect(result.current.totalSize).toBe(0);
    expect(result.current.offset).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('loadMore() does nothing when offset + 20 >= totalSize', () => {
    const { result } = renderSearchState();
    // totalSize is 0, offset is 0 — nextOffset (20) is not < totalSize (0)
    act(() => { result.current.loadMore(); });
    expect(mockRunSearch).not.toHaveBeenCalled();
  });
});
