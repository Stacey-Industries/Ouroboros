import { useState, useEffect } from 'react';
import type { RefObject } from 'react';

export interface ScrollMetrics {
  scrollTop: number;
  containerHeight: number;
  scrollHeight: number;
}

/**
 * Track scroll position and container dimensions for a scrollable element.
 * Updates on scroll events and container resize.
 */
export function useScrollMetrics(
  scrollRef: RefObject<HTMLDivElement | null>
): ScrollMetrics {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    containerHeight: 0,
    scrollHeight: 0,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setMetrics({
        scrollTop: el.scrollTop,
        containerHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  return metrics;
}
