/**
 * useVisualViewportInsets.test.ts
 *
 * Verifies that:
 * 1. The hook sets --keyboard-inset when visualViewport height drops on a phone.
 * 2. Small deltas (≤ 50 px) are suppressed (jitter guard).
 * 3. The CSS var is reset to 0px on unmount.
 * 4. The hook is a no-op when window.visualViewport is undefined.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Breakpoint mock ───────────────────────────────────────────────────────────
// Must be hoisted above the module import so the factory runs before the hook
// module is evaluated.
vi.mock('./useViewportBreakpoint', () => ({
  useViewportBreakpoint: vi.fn(() => 'phone'),
}));

import { useViewportBreakpoint } from './useViewportBreakpoint';
import { useVisualViewportInsets } from './useVisualViewportInsets';

// ── VisualViewport stub ───────────────────────────────────────────────────────

interface FakeVisualViewport extends EventTarget {
  height: number;
}

function makeViewport(height: number): FakeVisualViewport {
  const vp = new EventTarget() as FakeVisualViewport;
  vp.height = height;
  return vp;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInset(): string {
  return document.documentElement.style.getPropertyValue('--keyboard-inset');
}

function triggerResize(vp: FakeVisualViewport, newHeight: number): void {
  vp.height = newHeight;
  vp.dispatchEvent(new Event('resize'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useVisualViewportInsets', () => {
  let originalVV: VisualViewport | null;

  beforeEach(() => {
    vi.useFakeTimers();
    originalVV = window.visualViewport;
    // Reset CSS var before each test.
    document.documentElement.style.setProperty('--keyboard-inset', '0px');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(useViewportBreakpoint).mockReturnValue('phone');
    Object.defineProperty(window, 'visualViewport', {
      value: originalVV,
      writable: true,
      configurable: true,
    });
  });

  it('sets --keyboard-inset when viewport height drops by > 50px', () => {
    // innerHeight = 844 (iPhone 14), keyboard opens → vp.height = 444
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const vp = makeViewport(844);
    Object.defineProperty(window, 'visualViewport', { value: vp, configurable: true });

    const { unmount } = renderHook(() => useVisualViewportInsets());

    // Keyboard opens: height drops 400 px
    triggerResize(vp, 444);
    vi.runAllTimers();

    expect(getInset()).toBe('400px');
    unmount();
  });

  it('suppresses updates when delta is ≤ 50px (jitter guard)', () => {
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const vp = makeViewport(844);
    Object.defineProperty(window, 'visualViewport', { value: vp, configurable: true });

    const { unmount } = renderHook(() => useVisualViewportInsets());

    // Small jitter — iOS URL bar collapse is typically 50 px or less
    triggerResize(vp, 804); // delta = 40 px → suppressed
    vi.runAllTimers();

    expect(getInset()).toBe('0px');
    unmount();
  });

  it('resets --keyboard-inset to 0px on unmount', () => {
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const vp = makeViewport(444);
    Object.defineProperty(window, 'visualViewport', { value: vp, configurable: true });

    // Pre-set a non-zero value to simulate keyboard open state.
    document.documentElement.style.setProperty('--keyboard-inset', '400px');

    const { unmount } = renderHook(() => useVisualViewportInsets());
    unmount();

    expect(getInset()).toBe('0px');
  });

  it('is a no-op when window.visualViewport is undefined', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });

    // Should not throw; CSS var should remain untouched.
    expect(() => renderHook(() => useVisualViewportInsets())).not.toThrow();
    expect(getInset()).toBe('0px');
  });

  it('is a no-op on tablet/desktop (breakpoint gate)', () => {
    vi.mocked(useViewportBreakpoint).mockReturnValue('desktop');
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    const vp = makeViewport(500);
    Object.defineProperty(window, 'visualViewport', { value: vp, configurable: true });

    const { unmount } = renderHook(() => useVisualViewportInsets());

    triggerResize(vp, 400);
    vi.runAllTimers();

    // No update — hook should have returned early before subscribing.
    expect(getInset()).toBe('0px');
    unmount();
  });
});
