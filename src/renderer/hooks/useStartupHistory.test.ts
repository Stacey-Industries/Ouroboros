/**
 * useStartupHistory.test.ts — Smoke tests for useStartupHistory hook.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StartupHistoryRecord } from '../types/electron';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetStartupHistory = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { perf: { getStartupHistory: mockGetStartupHistory } },
    writable: true,
    configurable: true,
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRecord(ts: string, deltaMs: number): StartupHistoryRecord {
  return {
    ts,
    timings: [{ phase: 'first-render', tsNs: '1000000', deltaMs }],
    platform: 'win32',
    version: '1.0.0',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useStartupHistory', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty records and loading=false when IPC returns empty list', async () => {
    mockGetStartupHistory.mockResolvedValue({ success: true, records: [] });

    const { useStartupHistory } = await import('./useStartupHistory');
    const { result } = renderHook(() => useStartupHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.records).toEqual([]);
  });

  it('returns records from a successful IPC call', async () => {
    const record = makeRecord('2026-04-13T10:00:00.000Z', 800);
    mockGetStartupHistory.mockResolvedValue({ success: true, records: [record] });

    const { useStartupHistory } = await import('./useStartupHistory');
    const { result } = renderHook(() => useStartupHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0].ts).toBe('2026-04-13T10:00:00.000Z');
  });

  it('reload triggers a second IPC call', async () => {
    const record = makeRecord('2026-04-13T10:00:00.000Z', 900);
    mockGetStartupHistory.mockResolvedValue({ success: true, records: [record] });

    const { useStartupHistory } = await import('./useStartupHistory');
    const { result } = renderHook(() => useStartupHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetStartupHistory).toHaveBeenCalledTimes(1);

    act(() => { result.current.reload(); });

    await waitFor(() => expect(mockGetStartupHistory).toHaveBeenCalledTimes(2));
  });

  it('passes the limit argument to IPC', async () => {
    mockGetStartupHistory.mockResolvedValue({ success: true, records: [] });

    const { useStartupHistory } = await import('./useStartupHistory');
    renderHook(() => useStartupHistory(5));

    await waitFor(() => expect(mockGetStartupHistory).toHaveBeenCalledWith(5));
  });

  it('remains stable when IPC rejects (no crash)', async () => {
    mockGetStartupHistory.mockRejectedValue(new Error('handler not ready'));

    const { useStartupHistory } = await import('./useStartupHistory');
    const { result } = renderHook(() => useStartupHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.records).toEqual([]);
  });

  it('does not update records when success is false', async () => {
    mockGetStartupHistory.mockResolvedValue({ success: false, error: 'read error' });

    const { useStartupHistory } = await import('./useStartupHistory');
    const { result } = renderHook(() => useStartupHistory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.records).toEqual([]);
  });
});
