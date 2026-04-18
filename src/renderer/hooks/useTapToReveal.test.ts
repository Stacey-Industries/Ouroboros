/**
 * @vitest-environment jsdom
 *
 * useTapToReveal — unit tests
 *
 * Covers:
 *   1. Phone: tap inside reveals, tap outside collapses.
 *   2. Desktop/tablet: hook returns isRevealed:true and a noop toggle.
 *   3. data-revealed attribute is applied / removed in sync with state.
 *   4. toggle() helper directly flips state on phone.
 */

import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./useViewportBreakpoint', () => ({
  useViewportBreakpoint: vi.fn(),
}));

// Imports after vi.mock so the mock is active when modules are resolved.
import { useTapToReveal } from './useTapToReveal';
import { useViewportBreakpoint } from './useViewportBreakpoint';

const mockBreakpoint = useViewportBreakpoint as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function firePointerDown(target: Node): void {
  const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
  // Override target to simulate origin inside/outside the container
  Object.defineProperty(event, 'target', { value: target, configurable: true });
  document.dispatchEvent(event);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTapToReveal', () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  afterEach(() => {
    if (el.parentNode) document.body.removeChild(el);
    vi.clearAllMocks();
  });

  describe('desktop pass-through', () => {
    it('returns isRevealed:true and noop toggle on desktop', () => {
      mockBreakpoint.mockReturnValue('desktop');
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const { result } = renderHook(() => useTapToReveal(ref));

      expect(result.current.isRevealed).toBe(true);
      // toggle must be a no-op — state stays true
      act(() => result.current.toggle());
      expect(result.current.isRevealed).toBe(true);
    });

    it('returns isRevealed:true on tablet', () => {
      mockBreakpoint.mockReturnValue('tablet');
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const { result } = renderHook(() => useTapToReveal(ref));
      expect(result.current.isRevealed).toBe(true);
    });

    it('does not attach any pointerdown listener on desktop', () => {
      mockBreakpoint.mockReturnValue('desktop');
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const spy = vi.spyOn(document, 'addEventListener');
      const { unmount } = renderHook(() => useTapToReveal(ref));
      const pointerdownCalls = spy.mock.calls.filter(([type]) => type === 'pointerdown');
      expect(pointerdownCalls).toHaveLength(0);
      unmount();
      spy.mockRestore();
    });
  });

  describe('phone tap-to-reveal', () => {
    beforeEach(() => {
      mockBreakpoint.mockReturnValue('phone');
    });

    it('starts hidden (isRevealed:false) on phone', () => {
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const { result } = renderHook(() => useTapToReveal(ref));
      expect(result.current.isRevealed).toBe(false);
    });

    it('tap inside the element reveals (isRevealed → true)', () => {
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const { result } = renderHook(() => useTapToReveal(ref));
      expect(result.current.isRevealed).toBe(false);

      act(() => firePointerDown(el));
      expect(result.current.isRevealed).toBe(true);
    });

    it('sets data-revealed="true" attribute on reveal', () => {
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      renderHook(() => useTapToReveal(ref));
      expect(el.getAttribute('data-revealed')).toBeNull();

      act(() => firePointerDown(el));
      expect(el.getAttribute('data-revealed')).toBe('true');
    });

    it('second tap inside toggles back to hidden', () => {
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const { result } = renderHook(() => useTapToReveal(ref));

      act(() => firePointerDown(el));
      expect(result.current.isRevealed).toBe(true);

      act(() => firePointerDown(el));
      expect(result.current.isRevealed).toBe(false);
      expect(el.getAttribute('data-revealed')).toBeNull();
    });

    it('tap outside collapses (isRevealed → false)', () => {
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const { result } = renderHook(() => useTapToReveal(ref));

      // Reveal first
      act(() => firePointerDown(el));
      expect(result.current.isRevealed).toBe(true);

      // Outside element
      const outside = document.createElement('span');
      document.body.appendChild(outside);
      act(() => firePointerDown(outside));
      expect(result.current.isRevealed).toBe(false);
      expect(el.getAttribute('data-revealed')).toBeNull();
      document.body.removeChild(outside);
    });

    it('toggle() helper flips state directly', () => {
      const ref = createRef<HTMLElement>();
      (ref as React.MutableRefObject<HTMLElement>).current = el;

      const { result } = renderHook(() => useTapToReveal(ref));
      expect(result.current.isRevealed).toBe(false);

      act(() => result.current.toggle());
      expect(result.current.isRevealed).toBe(true);

      act(() => result.current.toggle());
      expect(result.current.isRevealed).toBe(false);
    });
  });
});
