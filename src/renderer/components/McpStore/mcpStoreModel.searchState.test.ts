/**
 * @vitest-environment jsdom
 *
 * Smoke tests for useMcpStoreSearchState.
 * Mocks window.electronAPI.mcpStore to stay in-process.
 */
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpStoreSource } from './mcpStoreModel';
import { useMcpStoreSearchState } from './mcpStoreModel.searchState';

const apiStub = {
  search: vi.fn(),
  searchNpm: vi.fn(),
  getInstalled: vi.fn(),
  install: vi.fn(),
  uninstall: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(window, 'electronAPI', {
    value: { mcpStore: apiStub },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSearchState(source: McpStoreSource = 'registry') {
  const setError = vi.fn();
  return renderHook(() => {
    const sourceRef = useRef<McpStoreSource>(source);
    return useMcpStoreSearchState({ sourceRef, setError });
  });
}

describe('useMcpStoreSearchState', () => {
  it('initialises with empty state', () => {
    const { result } = renderSearchState();
    expect(result.current.query).toBe('');
    expect(result.current.servers).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.npmTotal).toBe(0);
    expect(result.current.npmOffset).toBe(0);
  });

  it('search() calls api.search for registry source', async () => {
    const server = { name: 'test-server', description: 'Test' };
    apiStub.search.mockResolvedValue({ success: true, servers: [server], nextCursor: null });
    const { result } = renderSearchState('registry');
    await act(async () => { result.current.search(); await Promise.resolve(); });
    expect(apiStub.search).toHaveBeenCalledOnce();
  });

  it('search() calls api.searchNpm for npm source', async () => {
    apiStub.searchNpm.mockResolvedValue({ success: true, servers: [], total: 0 });
    const { result } = renderSearchState('npm');
    await act(async () => { result.current.search(); await Promise.resolve(); });
    expect(apiStub.searchNpm).toHaveBeenCalledOnce();
  });

  it('setQuery() updates query and debounces search', async () => {
    apiStub.search.mockResolvedValue({ success: true, servers: [], nextCursor: null });
    const { result } = renderSearchState('registry');
    act(() => { result.current.setQuery('hello'); });
    expect(result.current.query).toBe('hello');
    expect(apiStub.search).not.toHaveBeenCalled();
    await act(async () => { vi.runAllTimers(); await Promise.resolve(); });
    expect(apiStub.search).toHaveBeenCalledOnce();
  });

  it('resetResults() clears all search state', () => {
    const { result } = renderSearchState();
    act(() => { result.current.resetResults(); });
    expect(result.current.servers).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.npmTotal).toBe(0);
    expect(result.current.npmOffset).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('loadMore() with nextCursor calls registry search in append mode', async () => {
    apiStub.search.mockResolvedValue({ success: true, servers: [], nextCursor: 'cursor-1' });
    const { result } = renderSearchState('registry');
    await act(async () => { result.current.search(); await Promise.resolve(); });
    apiStub.search.mockResolvedValue({ success: true, servers: [], nextCursor: null });
    await act(async () => { result.current.loadMore(); await Promise.resolve(); });
    expect(apiStub.search).toHaveBeenCalledTimes(2);
  });

  it('loadMore() with npm source passes npmOffset', async () => {
    apiStub.searchNpm.mockResolvedValue({ success: true, servers: [{ name: 'a' }], total: 10 });
    const { result } = renderSearchState('npm');
    await act(async () => { result.current.search(); await Promise.resolve(); });
    apiStub.searchNpm.mockResolvedValue({ success: true, servers: [], total: 10 });
    await act(async () => { result.current.loadMore(); await Promise.resolve(); });
    expect(apiStub.searchNpm).toHaveBeenCalledTimes(2);
    const secondCall = apiStub.searchNpm.mock.calls[1];
    expect(secondCall[1]).toBe(1); // offset = previous servers.length
  });

  it('exposes setQuery, search, loadMore, resetResults as functions', () => {
    const { result } = renderSearchState();
    expect(typeof result.current.setQuery).toBe('function');
    expect(typeof result.current.search).toBe('function');
    expect(typeof result.current.loadMore).toBe('function');
    expect(typeof result.current.resetResults).toBe('function');
  });
});
