/**
 * useVisualViewportInsets — tracks the virtual keyboard inset on phones.
 *
 * Subscribes to window.visualViewport resize/scroll events and sets the
 * --keyboard-inset CSS custom property on <html> so the chat composer can
 * float above the soft keyboard on iOS Safari and Android Chrome.
 *
 * Guards:
 * - No-op when window.visualViewport is undefined (desktop browsers, jsdom).
 * - No-op when useViewportBreakpoint() !== 'phone' (tablet / desktop / Electron).
 * - Updates are debounced at 100 ms.
 * - Updates are suppressed when the delta from the last applied value is ≤ 50 px
 *   (prevents jitter from iOS URL-bar collapse).
 */

import { useEffect, useRef } from 'react';

import { useViewportBreakpoint } from './useViewportBreakpoint';

const CSS_VAR = '--keyboard-inset';
const DEBOUNCE_MS = 100;
const JITTER_THRESHOLD_PX = 50;

function computeInset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height);
}

function applyInset(px: number): void {
  document.documentElement.style.setProperty(CSS_VAR, `${px}px`);
}

function clearInset(): void {
  document.documentElement.style.setProperty(CSS_VAR, '0px');
}

export function useVisualViewportInsets(): void {
  const breakpoint = useViewportBreakpoint();
  const lastApplied = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (breakpoint !== 'phone') return;
    if (typeof window === 'undefined') return;
    if (!window.visualViewport) return;

    function flush(): void {
      const next = computeInset();
      const delta = Math.abs(next - lastApplied.current);
      if (delta <= JITTER_THRESHOLD_PX) return;
      lastApplied.current = next;
      applyInset(next);
    }

    function scheduleFlush(): void {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    }

    window.visualViewport.addEventListener('resize', scheduleFlush);
    window.visualViewport.addEventListener('scroll', scheduleFlush);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.visualViewport?.removeEventListener('resize', scheduleFlush);
      window.visualViewport?.removeEventListener('scroll', scheduleFlush);
      clearInset();
      lastApplied.current = 0;
    };
  }, [breakpoint]);
}
