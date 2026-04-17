/**
 * useSymbolDisambiguation.test.ts — unit tests for the bare @symbol: resolver.
 *
 * Tests:
 * - extractBareSymbolQuery helper (pure, synchronous)
 * - useSymbolDisambiguation hook state transitions
 * - Debounce de-duplication (same query doesn't re-fire)
 * - enabled=false is a no-op
 * - Full pin-key format (::) is ignored (already-resolved)
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractBareSymbolQuery,
  useSymbolDisambiguation,
} from './useSymbolDisambiguation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSearchResult(name: string, filePath = `src/${name}.ts`) {
  return {
    node: { id: name, type: 'function', name, filePath, line: 5 },
    score: 90,
    matchReason: 'exact match',
  };
}

function setApi(searchFn: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, 'electronAPI', {
    value: { graph: { searchGraph: searchFn } },
    configurable: true,
    writable: true,
  });
}

// ── extractBareSymbolQuery ────────────────────────────────────────────────────

describe('extractBareSymbolQuery', () => {
  it('returns the bare name for "symbol:functionName"', () => {
    expect(extractBareSymbolQuery('symbol:functionName')).toBe('functionName');
  });

  it('returns null when query does not start with "symbol:"', () => {
    expect(extractBareSymbolQuery('file:foo')).toBeNull();
    expect(extractBareSymbolQuery('diff')).toBeNull();
    expect(extractBareSymbolQuery('')).toBeNull();
  });

  it('returns null for already-resolved full key (contains "::")', () => {
    expect(extractBareSymbolQuery('symbol:src/a.ts::myFn::10')).toBeNull();
  });

  it('returns null when name is empty after "symbol:"', () => {
    expect(extractBareSymbolQuery('symbol:')).toBeNull();
    expect(extractBareSymbolQuery('symbol:   ')).toBeNull();
  });

  it('trims whitespace from the bare name', () => {
    expect(extractBareSymbolQuery('symbol:  myFn  ')).toBe('myFn');
  });
});

// ── useSymbolDisambiguation ───────────────────────────────────────────────────

describe('useSymbolDisambiguation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('starts with empty results and loading=false', () => {
    const { result } = renderHook(() =>
      useSymbolDisambiguation({ query: '', enabled: true }),
    );
    expect(result.current.symbolResults).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('is a no-op when enabled=false', async () => {
    const searchFn = vi.fn().mockResolvedValue({ success: true, results: [] });
    setApi(searchFn);

    renderHook(() =>
      useSymbolDisambiguation({ query: 'symbol:myFn', enabled: false }),
    );

    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('does not fetch for non-symbol: query prefix', async () => {
    const searchFn = vi.fn();
    setApi(searchFn);

    renderHook(() =>
      useSymbolDisambiguation({ query: 'file:something', enabled: true }),
    );

    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('does not fetch for already-resolved @symbol: key with "::"', async () => {
    const searchFn = vi.fn();
    setApi(searchFn);

    renderHook(() =>
      useSymbolDisambiguation({ query: 'symbol:src/a.ts::myFn::10', enabled: true }),
    );

    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('sets loading=true immediately then resolves results after debounce', async () => {
    const results = [makeSearchResult('myFn')];
    const searchFn = vi.fn().mockResolvedValue({ success: true, results });
    setApi(searchFn);

    const { result } = renderHook(() =>
      useSymbolDisambiguation({ query: 'symbol:myFn', enabled: true }),
    );

    // loading should be true before the debounce fires
    expect(result.current.loading).toBe(true);

    await act(async () => { vi.runAllTimers(); });

    expect(result.current.loading).toBe(false);
    expect(result.current.symbolResults).toHaveLength(1);
    expect(result.current.symbolResults[0].name).toBe('myFn');
  });

  it('passes the bare name to searchGraph', async () => {
    const searchFn = vi.fn().mockResolvedValue({ success: true, results: [] });
    setApi(searchFn);

    renderHook(() =>
      useSymbolDisambiguation({ query: 'symbol:doThing', enabled: true }),
    );

    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).toHaveBeenCalledWith('doThing', 15);
  });

  it('does not re-fetch when the same query is provided twice', async () => {
    const searchFn = vi.fn().mockResolvedValue({ success: true, results: [] });
    setApi(searchFn);

    const { rerender } = renderHook(
      ({ q }: { q: string }) =>
        useSymbolDisambiguation({ query: q, enabled: true }),
      { initialProps: { q: 'symbol:myFn' } },
    );

    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).toHaveBeenCalledTimes(1);

    rerender({ q: 'symbol:myFn' });
    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).toHaveBeenCalledTimes(1); // no extra call
  });

  it('re-fetches when the query changes to a different name', async () => {
    const searchFn = vi.fn().mockResolvedValue({ success: true, results: [] });
    setApi(searchFn);

    const { rerender } = renderHook(
      ({ q }: { q: string }) =>
        useSymbolDisambiguation({ query: q, enabled: true }),
      { initialProps: { q: 'symbol:fn1' } },
    );

    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).toHaveBeenCalledTimes(1);

    rerender({ q: 'symbol:fn2' });
    await act(async () => { vi.runAllTimers(); });
    expect(searchFn).toHaveBeenCalledTimes(2);
    expect(searchFn.mock.calls[1][0]).toBe('fn2');
  });

  it('clears results when query changes away from symbol:', async () => {
    const searchFn = vi.fn().mockResolvedValue({
      success: true,
      results: [makeSearchResult('myFn')],
    });
    setApi(searchFn);

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useSymbolDisambiguation({ query: q, enabled: true }),
      { initialProps: { q: 'symbol:myFn' } },
    );

    await act(async () => { vi.runAllTimers(); });
    expect(result.current.symbolResults).toHaveLength(1);

    rerender({ q: 'something-else' });
    await act(async () => {});
    expect(result.current.symbolResults).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets empty results when searchGraph returns success=false', async () => {
    const searchFn = vi.fn().mockResolvedValue({ success: false, error: 'No graph' });
    setApi(searchFn);

    const { result } = renderHook(() =>
      useSymbolDisambiguation({ query: 'symbol:anything', enabled: true }),
    );

    await act(async () => { vi.runAllTimers(); });
    expect(result.current.symbolResults).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets empty results when searchGraph rejects', async () => {
    const searchFn = vi.fn().mockRejectedValue(new Error('IPC error'));
    setApi(searchFn);

    const { result } = renderHook(() =>
      useSymbolDisambiguation({ query: 'symbol:broken', enabled: true }),
    );

    await act(async () => { vi.runAllTimers(); });
    expect(result.current.symbolResults).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('maps graph search results to SymbolGraphNode shape', async () => {
    const raw = [makeSearchResult('handleRequest', 'src/server.ts')];
    const searchFn = vi.fn().mockResolvedValue({ success: true, results: raw });
    setApi(searchFn);

    const { result } = renderHook(() =>
      useSymbolDisambiguation({ query: 'symbol:handleRequest', enabled: true }),
    );

    await act(async () => { vi.runAllTimers(); });
    const first = result.current.symbolResults[0];
    expect(first.name).toBe('handleRequest');
    expect(first.type).toBe('function');
    expect(first.filePath).toBe('src/server.ts');
    expect(first.line).toBe(5);
  });
});
