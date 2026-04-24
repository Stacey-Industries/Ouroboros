/**
 * @vitest-environment jsdom
 *
 * useTerminalDockState — smoke tests (Wave 46 Phase C).
 *
 * Verifies:
 *  - Returns defaults when no persisted state is present.
 *  - Reads persisted state on mount.
 *  - toggleVisible / setVisible flip the visible flag.
 *  - setHeight clamps to [MIN_HEIGHT, MAX_HEIGHT].
 *  - Persists updates to localStorage.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TERMINAL_DOCK_CONSTANTS, useTerminalDockState } from './useTerminalDockState';

const STORAGE_KEY = 'agent-ide:chat-workbench-terminal-dock';

describe('useTerminalDockState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns default state when localStorage is empty', () => {
    const { result } = renderHook(() => useTerminalDockState());
    expect(result.current.visible).toBe(false);
    expect(result.current.height).toBe(TERMINAL_DOCK_CONSTANTS.DEFAULT_HEIGHT);
  });

  it('reads persisted state on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible: true, height: 300 }));
    const { result } = renderHook(() => useTerminalDockState());
    expect(result.current.visible).toBe(true);
    expect(result.current.height).toBe(300);
  });

  it('toggleVisible flips visibility and persists', () => {
    const { result } = renderHook(() => useTerminalDockState());
    act(() => {
      result.current.toggleVisible();
    });
    expect(result.current.visible).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored.visible).toBe(true);
  });

  it('setVisible(false) hides the dock', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible: true, height: 240 }));
    const { result } = renderHook(() => useTerminalDockState());
    act(() => {
      result.current.setVisible(false);
    });
    expect(result.current.visible).toBe(false);
  });

  it('setHeight clamps below min', () => {
    const { result } = renderHook(() => useTerminalDockState());
    act(() => {
      result.current.setHeight(10);
    });
    expect(result.current.height).toBe(TERMINAL_DOCK_CONSTANTS.MIN_HEIGHT);
  });

  it('setHeight clamps above max', () => {
    const { result } = renderHook(() => useTerminalDockState());
    act(() => {
      result.current.setHeight(9999);
    });
    expect(result.current.height).toBe(TERMINAL_DOCK_CONSTANTS.MAX_HEIGHT);
  });

  it('setHeight accepts and persists in-range values', () => {
    const { result } = renderHook(() => useTerminalDockState());
    act(() => {
      result.current.setHeight(320);
    });
    expect(result.current.height).toBe(320);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored.height).toBe(320);
  });

  it('ignores corrupt persisted state', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json');
    const { result } = renderHook(() => useTerminalDockState());
    expect(result.current.visible).toBe(false);
    expect(result.current.height).toBe(TERMINAL_DOCK_CONSTANTS.DEFAULT_HEIGHT);
  });
});
