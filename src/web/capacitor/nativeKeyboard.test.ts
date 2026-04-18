/**
 * nativeKeyboard.test.ts — tests for the Keyboard plugin bridge.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const removeShow = vi.fn();
  const removeHide = vi.fn();
  const showCbs: Array<(info: { keyboardHeight: number }) => void> = [];
  const hideCbs: Array<() => void> = [];

  const addListener = vi.fn(
    async (event: string, cb: (info?: { keyboardHeight: number }) => void) => {
      if (event === 'keyboardDidShow') {
        showCbs.push(cb as (info: { keyboardHeight: number }) => void);
        return { remove: removeShow };
      }
      hideCbs.push(cb as () => void);
      return { remove: removeHide };
    },
  );

  return {
    isNativePlatform: vi.fn(() => false),
    addListener,
    removeShow,
    removeHide,
    showCbs,
    hideCbs,
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: { addListener: mocks.addListener },
}));

// ─── DOM stub ────────────────────────────────────────────────────────────────

const mockSetProperty = vi.fn();
Object.defineProperty(globalThis, 'document', {
  value: { documentElement: { style: { setProperty: mockSetProperty } } },
  writable: true,
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { initKeyboardListeners } from './nativeKeyboard';

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  mocks.showCbs.length = 0;
  mocks.hideCbs.length = 0;
});

describe('nativeKeyboard — web fallback (isNativePlatform = false)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(false); });

  it('returns a no-op cleanup without attaching listeners', async () => {
    const cleanup = await initKeyboardListeners();
    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe('function');
  });

  it('cleanup no-op does not call remove', async () => {
    const cleanup = await initKeyboardListeners();
    expect(() => cleanup()).not.toThrow();
    expect(mocks.removeShow).not.toHaveBeenCalled();
    expect(mocks.removeHide).not.toHaveBeenCalled();
  });
});

describe('nativeKeyboard — native path (isNativePlatform = true)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(true); });

  it('registers keyboardDidShow and keyboardDidHide listeners', async () => {
    await initKeyboardListeners();
    expect(mocks.addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    expect(mocks.addListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
  });

  it('keyboardDidShow sets --native-keyboard-height to the reported height', async () => {
    await initKeyboardListeners();
    mocks.showCbs[0]({ keyboardHeight: 320 });
    expect(mockSetProperty).toHaveBeenCalledWith('--native-keyboard-height', '320px');
  });

  it('keyboardDidHide resets --native-keyboard-height to 0px', async () => {
    await initKeyboardListeners();
    mocks.hideCbs[0]();
    expect(mockSetProperty).toHaveBeenCalledWith('--native-keyboard-height', '0px');
  });

  it('cleanup calls remove on both listener handles', async () => {
    const cleanup = await initKeyboardListeners();
    cleanup();
    expect(mocks.removeShow).toHaveBeenCalled();
    expect(mocks.removeHide).toHaveBeenCalled();
  });
});
