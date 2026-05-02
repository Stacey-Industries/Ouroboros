import { useEffect } from 'react';

/**
 * Closes a popover/menu when the user clicks (or taps) outside of `ref`.
 *
 * Uses `pointerdown` rather than `mousedown` so touch input on mobile/tablet
 * surfaces fires the dismiss without waiting for the click that may never come
 * (e.g. swipe gestures don't synthesize click).
 *
 * No-op when `open` is false — the listener only attaches while the popover
 * is open, so closed popovers don't pay the per-click cost.
 */
export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    function handler(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [ref, open, onClose]);
}
