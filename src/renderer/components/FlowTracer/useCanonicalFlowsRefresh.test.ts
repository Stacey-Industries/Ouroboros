/**
 * useCanonicalFlowsRefresh.test.ts — Smoke tests for the gallery-refresh hook.
 * @vitest-environment jsdom
 *
 * Wave 85 Phase 5.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanonicalFlowsRefresh } from './useCanonicalFlowsRefresh';

// ---------------------------------------------------------------------------
// Mock window.electronAPI
// ---------------------------------------------------------------------------

const mockRegenerateGallery = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    flowTracer: {
      regenerateGallery: mockRegenerateGallery,
    },
  },
});

beforeEach(() => {
  mockRegenerateGallery.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCanonicalFlowsRefresh', () => {
  it('starts with isRefreshing=false and no error', () => {
    const { result } = renderHook(() => useCanonicalFlowsRefresh());
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.refreshError).toBeNull();
  });

  it('sets isRefreshing=true during the call and false after success', async () => {
    mockRegenerateGallery.mockResolvedValue({ success: true, flows: [] });

    const { result } = renderHook(() => useCanonicalFlowsRefresh());
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.refreshError).toBeNull();
    expect(mockRegenerateGallery).toHaveBeenCalledOnce();
  });

  it('sets refreshError when the IPC call returns success=false', async () => {
    mockRegenerateGallery.mockResolvedValue({ success: false, error: 'CLI unavailable' });

    const { result } = renderHook(() => useCanonicalFlowsRefresh());
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.refreshError).toBe('CLI unavailable');
  });

  it('sets refreshError when the IPC call throws', async () => {
    mockRegenerateGallery.mockRejectedValue(new Error('IPC channel closed'));

    const { result } = renderHook(() => useCanonicalFlowsRefresh());
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.refreshError).toBe('IPC channel closed');
  });

  it('clears a previous error on a successful retry', async () => {
    mockRegenerateGallery
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue({ success: true, flows: [] });

    const { result } = renderHook(() => useCanonicalFlowsRefresh());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.refreshError).toBe('first failure');

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.refreshError).toBeNull();
  });
});
