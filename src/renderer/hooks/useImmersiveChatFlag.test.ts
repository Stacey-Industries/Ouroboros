/**
 * @vitest-environment jsdom
 *
 * useImmersiveChatFlag — unit tests (Wave 42 Phase B).
 *
 * Covers:
 *  - readFlag() returns false when flag is absent.
 *  - readFlag() returns true when config has layout.immersiveChat === true.
 *  - Hook initialises to false when config flag is unset.
 *  - Hook initialises to true when config flag is set.
 *  - DOM event flips the flag value.
 *  - Event listener is cleaned up on unmount.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __testing, useImmersiveChatFlag } from './useImmersiveChatFlag';

const { readFlag } = __testing;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeElectronAPI(immersiveChat?: boolean) {
  return {
    config: {
      getAll: vi.fn().mockResolvedValue(
        immersiveChat === undefined
          ? {}
          : { layout: { immersiveChat } },
      ),
      set: vi.fn().mockResolvedValue({ success: true }),
    },
  };
}

const TOGGLE_EVENT = 'agent-ide:toggle-immersive-chat';

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset electronAPI before each test.
  Object.defineProperty(window, 'electronAPI', {
    value: makeElectronAPI(false),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── readFlag() ────────────────────────────────────────────────────────────────

describe('readFlag', () => {
  it('returns false when flag is absent from config', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: makeElectronAPI(undefined),
      writable: true,
      configurable: true,
    });
    const result = await readFlag();
    expect(result).toBe(false);
  });

  it('returns true when layout.immersiveChat is true', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: makeElectronAPI(true),
      writable: true,
      configurable: true,
    });
    const result = await readFlag();
    expect(result).toBe(true);
  });

  it('returns false when layout.immersiveChat is false', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: makeElectronAPI(false),
      writable: true,
      configurable: true,
    });
    const result = await readFlag();
    expect(result).toBe(false);
  });
});

// ── useImmersiveChatFlag ──────────────────────────────────────────────────────

describe('useImmersiveChatFlag', () => {
  it('initialises to false when config flag is unset', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: makeElectronAPI(undefined),
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useImmersiveChatFlag());
    await act(async () => { /* flush promises */ });
    expect(result.current).toBe(false);
  });

  it('initialises to true when config flag is set', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: makeElectronAPI(true),
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useImmersiveChatFlag());
    await act(async () => { /* flush promises */ });
    expect(result.current).toBe(true);
  });

  it('flips value when toggle DOM event fires', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: makeElectronAPI(false),
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useImmersiveChatFlag());
    await act(async () => { /* flush initial read */ });
    expect(result.current).toBe(false);

    act(() => { window.dispatchEvent(new CustomEvent(TOGGLE_EVENT)); });
    expect(result.current).toBe(true);

    act(() => { window.dispatchEvent(new CustomEvent(TOGGLE_EVENT)); });
    expect(result.current).toBe(false);
  });

  it('removes event listener on unmount', async () => {
    const { result, unmount } = renderHook(() => useImmersiveChatFlag());
    await act(async () => { /* flush */ });

    unmount();

    // Firing event after unmount must not update the (now-dead) hook.
    act(() => { window.dispatchEvent(new CustomEvent(TOGGLE_EVENT)); });
    expect(result.current).toBe(false);
  });
});
