/**
 * useDashboardData.test.ts — smoke tests for the dashboard data hook.
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDashboardData } from './useDashboardData';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGlobalResult(
  overrides: Partial<{ success: boolean; error: string }> = {},
) {
  return {
    success: true,
    rollup: {
      totalUsd: 1.5,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      threadCount: 2,
    },
    threads: [
      { threadId: 't1', inputTokens: 600, outputTokens: 300, totalUsd: 1.0 },
      { threadId: 't2', inputTokens: 400, outputTokens: 200, totalUsd: 0.5 },
    ],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDashboardData', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        agentChat: {
          getGlobalCostRollup: vi.fn().mockResolvedValue(makeGlobalResult()),
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('starts in loading state with null rollup', () => {
    const { result } = renderHook(() => useDashboardData());
    expect(result.current.loading).toBe(true);
    expect(result.current.rollup).toBeNull();
    expect(result.current.threads).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('populates rollup and threads after IPC resolves', async () => {
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.rollup?.totalUsd).toBeCloseTo(1.5);
    expect(result.current.threads).toHaveLength(2);
  });

  it('sets error when IPC returns success:false', async () => {
    (window.electronAPI.agentChat.getGlobalCostRollup as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ success: false, error: 'DB error' });
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.error).toBe('DB error');
    expect(result.current.rollup).toBeNull();
  });

  it('exposes setTimeRange and re-fetches on change', async () => {
    const mockFn = window.electronAPI.agentChat
      .getGlobalCostRollup as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(mockFn).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.setTimeRange('7d');
    });
    expect(mockFn).toHaveBeenCalledTimes(2);
    // 7d call should include a timeRange param
    const [payload] = mockFn.mock.calls[1] as [{ timeRange?: unknown }];
    expect(payload?.timeRange).toBeDefined();
  });

  it('re-fetches when refresh() is called', async () => {
    const mockFn = window.electronAPI.agentChat
      .getGlobalCostRollup as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(mockFn).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.refresh();
    });
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('passes undefined timeRange payload for "all" selection', async () => {
    const mockFn = window.electronAPI.agentChat
      .getGlobalCostRollup as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.timeRange).toBe('all');
    const [payload] = mockFn.mock.calls[0] as [{ timeRange?: unknown }];
    expect(payload?.timeRange).toBeUndefined();
  });
});
