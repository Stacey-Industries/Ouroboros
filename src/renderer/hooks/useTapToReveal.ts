/**
 * useTapToReveal — phone-only tap-to-reveal hook.
 *
 * On phone viewports, toggles a `data-revealed` attribute on the ref'd element
 * when the user taps (pointerdown) inside it. Tapping outside collapses.
 *
 * On non-phone viewports (tablet / desktop) the hook is a no-op: it returns
 * `{ isRevealed: true, toggle: noop }` so desktop hover CSS continues to work
 * without any JS intervention.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useViewportBreakpoint } from './useViewportBreakpoint';

export interface TapToRevealResult {
  isRevealed: boolean;
  toggle: () => void;
}

const NOOP = (): void => { /* desktop pass-through */ };

/** Apply / remove the data-revealed attribute to keep CSS in sync. */
function syncDataAttr(el: HTMLElement | null, revealed: boolean): void {
  if (!el) return;
  if (revealed) {
    el.setAttribute('data-revealed', 'true');
  } else {
    el.removeAttribute('data-revealed');
  }
}

/** Attach a document-level pointerdown listener that toggles reveal state. */
function usePhonePointerListener(
  ref: React.RefObject<HTMLElement | null>,
  revealedRef: React.MutableRefObject<boolean>,
  setIsRevealed: (v: boolean) => void,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;

    function handlePointerDown(e: PointerEvent): void {
      const el = ref.current;
      if (!el) return;
      const inside = el.contains(e.target as Node);
      const next = inside ? !revealedRef.current : false;
      setIsRevealed(next);
      syncDataAttr(el, next);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    const capturedEl = ref.current;
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      syncDataAttr(capturedEl, false);
    };
  }, [active, ref, revealedRef, setIsRevealed]);
}

/**
 * useTapToReveal
 *
 * @param ref - A ref to the element that acts as the reveal container.
 * @returns `{ isRevealed, toggle }` — on desktop always returns `isRevealed: true`.
 */
export function useTapToReveal(
  ref: React.RefObject<HTMLElement | null>,
): TapToRevealResult {
  const breakpoint = useViewportBreakpoint();
  const isPhone = breakpoint === 'phone';

  const [isRevealed, setIsRevealed] = useState(false);
  const revealedRef = useRef(isRevealed);
  revealedRef.current = isRevealed;

  const toggle = useCallback(() => {
    setIsRevealed((prev) => {
      const next = !prev;
      syncDataAttr(ref.current, next);
      return next;
    });
  }, [ref]);

  // Sync data attribute when isRevealed changes (e.g. programmatic toggle).
  useEffect(() => {
    syncDataAttr(ref.current, isRevealed);
  }, [ref, isRevealed]);

  usePhonePointerListener(ref, revealedRef, setIsRevealed, isPhone);

  if (!isPhone) return { isRevealed: true, toggle: NOOP };
  return { isRevealed, toggle };
}
