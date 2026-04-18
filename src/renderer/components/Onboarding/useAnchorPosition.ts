/**
 * useAnchorPosition.ts — computes absolute position from a data-tour-anchor element.
 * Wave 38 Phase B — first-run tour.
 *
 * Returns { top, left, width, height } for a given anchor name.
 * Falls back to centered overlay when the anchor element is absent.
 */
import { useCallback, useEffect, useState } from 'react';

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
  /** True when no DOM element was found for the anchor name. */
  isCentered: boolean;
}

function queryAnchor(anchorName: string): Element | null {
  return document.querySelector(`[data-tour-anchor="${anchorName}"]`);
}

function rectFromElement(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, isCentered: false };
}

function centeredRect(): AnchorRect {
  return {
    top: window.innerHeight / 2,
    left: window.innerWidth / 2,
    width: 0,
    height: 0,
    isCentered: true,
  };
}

function resolveRect(anchorName: string): AnchorRect {
  const el = queryAnchor(anchorName);
  return el ? rectFromElement(el) : centeredRect();
}

export function useAnchorPosition(anchorName: string): AnchorRect {
  const [rect, setRect] = useState<AnchorRect>(() => resolveRect(anchorName));

  const refresh = useCallback(() => {
    setRect(resolveRect(anchorName));
  }, [anchorName]);

  // Re-resolve when anchorName changes (step change).
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ResizeObserver on the anchor element — reposition when it moves/resizes.
  useEffect(() => {
    const el = queryAnchor(anchorName);
    if (!el) return;

    const observer = new ResizeObserver(refresh);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchorName, refresh]);

  // Also reposition on window resize (handles panel collapse/expand).
  useEffect(() => {
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, [refresh]);

  return rect;
}
