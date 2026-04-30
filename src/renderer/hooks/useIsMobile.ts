/**
 * useIsMobile.ts — viewport-width-based mobile detection.
 *
 * Returns `true` when the current viewport is narrower than the mobile
 * breakpoint (768px). Tracks live via matchMedia; SSR-safe (returns false
 * when window is undefined).
 */
import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 768px)';

function read(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => read());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
