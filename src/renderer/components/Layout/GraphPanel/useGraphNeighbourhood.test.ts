/**
 * useGraphNeighbourhood.test.ts — unit tests for the neighbourhood data-fetch hook.
 *
 * Exercises the state transitions (idle → loading → ready / error) and the
 * de-duplication guard that prevents re-fetching the same symbolId.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphNeighbourhoodResult } from '../../../types/electron-graph';
import { useGraphNeighbourhood } from './useGraphNeighbourhood';

// ── helpers ────────────────────────────────────────────────────────────────────

const SUCCESS_DATA: GraphNeighbourhoodResult = {
  success: true,
  symbol: { id: 'fn1', type: 'function', name: 'myFn', filePath: 'src/a.ts', line: 1 },
  callers: [],
  callees: [],
  imports: [],
};

const ERROR_DATA: GraphNeighbourhoodResult = {
  success: false,
  error: 'Symbol not found',
};

function makeApi(impl: () => Promise<GraphNeighbourhoodResult>) {
  return {
    graph: { getNeighbourhood: vi.fn(impl) },
  };
}

function setApi(api: unknown): void {
  Object.defineProperty(window, 'electronAPI', {
    value: api,
    configurable: true,
    writable: true,
  });
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('useGraphNeighbourhood', () => {
  beforeEach(() => setApi(makeApi(() => Promise.resolve(SUCCESS_DATA))));
  afterEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('starts with data=null and loading=false when symbolId is null', () => {
    const { result } = renderHook(() =>
      useGraphNeighbourhood({ symbolId: null, depth: 1, enabled: true }),
    );
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('does not fetch when enabled=false', async () => {
    const invokeFn = vi.fn().mockResolvedValue(SUCCESS_DATA);
    setApi({ graph: { getNeighbourhood: invokeFn } });
    renderHook(() =>
      useGraphNeighbourhood({ symbolId: 'fn1', depth: 1, enabled: false }),
    );
    await act(async () => {});
    expect(invokeFn).not.toHaveBeenCalled();
  });

  it('sets loading=true then resolves data on success', async () => {
    let resolve!: (v: GraphNeighbourhoodResult) => void;
    const deferred = new Promise<GraphNeighbourhoodResult>((r) => { resolve = r; });
    setApi({ graph: { getNeighbourhood: vi.fn(() => deferred) } });

    const { result } = renderHook(() =>
      useGraphNeighbourhood({ symbolId: 'fn1', depth: 1, enabled: true }),
    );

    expect(result.current.loading).toBe(true);

    await act(async () => { resolve(SUCCESS_DATA); await deferred; });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(SUCCESS_DATA);
  });

  it('sets data to error result when fetch fails', async () => {
    setApi({ graph: { getNeighbourhood: vi.fn().mockRejectedValue(new Error('network')) } });
    const { result } = renderHook(() =>
      useGraphNeighbourhood({ symbolId: 'fn1', depth: 1, enabled: true }),
    );
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.success).toBe(false);
  });

  it('does not re-fetch when the same symbolId is provided twice', async () => {
    const invokeFn = vi.fn().mockResolvedValue(SUCCESS_DATA);
    setApi({ graph: { getNeighbourhood: invokeFn } });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useGraphNeighbourhood({ symbolId: id, depth: 1, enabled: true }),
      { initialProps: { id: 'fn1' } },
    );
    await act(async () => {});
    expect(invokeFn).toHaveBeenCalledTimes(1);

    rerender({ id: 'fn1' });
    await act(async () => {});
    expect(invokeFn).toHaveBeenCalledTimes(1); // no extra call
    expect(result.current.data).toEqual(SUCCESS_DATA);
  });

  it('re-fetches when symbolId changes', async () => {
    const invokeFn = vi.fn().mockResolvedValue(SUCCESS_DATA);
    setApi({ graph: { getNeighbourhood: invokeFn } });

    const { rerender } = renderHook(
      ({ id }: { id: string }) =>
        useGraphNeighbourhood({ symbolId: id, depth: 1, enabled: true }),
      { initialProps: { id: 'fn1' } },
    );
    await act(async () => {});
    expect(invokeFn).toHaveBeenCalledTimes(1);

    rerender({ id: 'fn2' });
    await act(async () => {});
    expect(invokeFn).toHaveBeenCalledTimes(2);
    expect(invokeFn.mock.calls[1][0]).toBe('fn2');
  });

  it('clears data and loading when clear() is called', async () => {
    setApi({ graph: { getNeighbourhood: vi.fn().mockResolvedValue(SUCCESS_DATA) } });
    const { result } = renderHook(() =>
      useGraphNeighbourhood({ symbolId: 'fn1', depth: 1, enabled: true }),
    );
    await act(async () => {});
    expect(result.current.data).toEqual(SUCCESS_DATA);

    act(() => { result.current.clear(); });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('resets when symbolId becomes null', async () => {
    const invokeFn = vi.fn().mockResolvedValue(SUCCESS_DATA);
    setApi({ graph: { getNeighbourhood: invokeFn } });

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useGraphNeighbourhood({ symbolId: id, depth: 1, enabled: true }),
      { initialProps: { id: 'fn1' as string | null } },
    );
    await act(async () => {});
    expect(result.current.data).toEqual(SUCCESS_DATA);

    rerender({ id: null });
    await act(async () => {});
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('passes depth to the IPC call', async () => {
    const invokeFn = vi.fn().mockResolvedValue(SUCCESS_DATA);
    setApi({ graph: { getNeighbourhood: invokeFn } });
    renderHook(() =>
      useGraphNeighbourhood({ symbolId: 'fn1', depth: 2, enabled: true }),
    );
    await act(async () => {});
    expect(invokeFn).toHaveBeenCalledWith('fn1', 2);
  });

  it('stores error shape when API returns success=false', async () => {
    setApi({ graph: { getNeighbourhood: vi.fn().mockResolvedValue(ERROR_DATA) } });
    const { result } = renderHook(() =>
      useGraphNeighbourhood({ symbolId: 'missing', depth: 1, enabled: true }),
    );
    await act(async () => {});
    expect(result.current.data?.success).toBe(false);
    expect((result.current.data as GraphNeighbourhoodResult).error).toBe('Symbol not found');
  });
});
