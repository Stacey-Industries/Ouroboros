// @vitest-environment jsdom
/**
 * useWebConnectionState.test.ts — Wave 34 Phase G.
 *
 * Covers:
 *  - Electron branch: returns 'electron' when web-mode class is absent
 *  - Web branch: returns 'connecting' initially, updates on onConnectionState events
 *  - Cleanup: unsubscribes on unmount
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebConnectionState } from './useWebConnectionState';

// ── html class helpers ────────────────────────────────────────────────────────

function setWebMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('web-mode');
  } else {
    document.documentElement.classList.remove('web-mode');
  }
}

// ── electronAPI stub ──────────────────────────────────────────────────────────

let capturedCallback: ((s: string) => void) | null = null;
const mockCleanup = vi.fn();
const mockOnConnectionState = vi.fn((cb: (s: string) => void) => {
  capturedCallback = cb;
  return mockCleanup;
});

const mockElectronAPI = {
  app: { onConnectionState: mockOnConnectionState },
};

beforeEach(() => {
  capturedCallback = null;
  mockCleanup.mockReset();
  mockOnConnectionState.mockClear();
  (window as unknown as Record<string, unknown>).electronAPI = mockElectronAPI;
});

afterEach(() => {
  setWebMode(false);
  delete (window as unknown as Record<string, unknown>).electronAPI;
});

// ── Electron branch ───────────────────────────────────────────────────────────

describe('Electron mode (no web-mode class)', () => {
  beforeEach(() => setWebMode(false));

  it('returns "electron" immediately', () => {
    const { result } = renderHook(() => useWebConnectionState());
    expect(result.current).toBe('electron');
  });

  it('never subscribes to onConnectionState', () => {
    renderHook(() => useWebConnectionState());
    expect(mockOnConnectionState).not.toHaveBeenCalled();
  });
});

// ── Web branch ────────────────────────────────────────────────────────────────

describe('Web mode (web-mode class present)', () => {
  beforeEach(() => setWebMode(true));

  it('returns "connecting" as initial state', () => {
    const { result } = renderHook(() => useWebConnectionState());
    expect(result.current).toBe('connecting');
  });

  it('subscribes to onConnectionState on mount', () => {
    renderHook(() => useWebConnectionState());
    expect(mockOnConnectionState).toHaveBeenCalledOnce();
  });

  it('updates to "connected" when the transport fires connected', () => {
    const { result } = renderHook(() => useWebConnectionState());
    act(() => { capturedCallback?.('connected'); });
    expect(result.current).toBe('connected');
  });

  it('updates to "disconnected" when the transport fires disconnected', () => {
    const { result } = renderHook(() => useWebConnectionState());
    act(() => { capturedCallback?.('disconnected'); });
    expect(result.current).toBe('disconnected');
  });

  it('updates to "connecting" when the transport fires connecting', () => {
    const { result } = renderHook(() => useWebConnectionState());
    act(() => { capturedCallback?.('connected'); });
    act(() => { capturedCallback?.('connecting'); });
    expect(result.current).toBe('connecting');
  });

  it('calls cleanup on unmount', () => {
    const { unmount } = renderHook(() => useWebConnectionState());
    unmount();
    expect(mockCleanup).toHaveBeenCalledOnce();
  });
});
