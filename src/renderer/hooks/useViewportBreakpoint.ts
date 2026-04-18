/**
 * useViewportBreakpoint — returns the current viewport tier for responsive layout.
 *
 * Returns 'desktop' immediately in Electron (no `.web-mode` class on <html>) or
 * during SSR (typeof window === 'undefined'). In web mode, reads window.matchMedia
 * and subscribes to breakpoint crossings — only actual threshold crossings trigger
 * a re-render, not every resize tick.
 *
 * Breakpoints:
 *   phone   ≤ 768px
 *   tablet  769px – 1024px
 *   desktop > 1024px
 */

import { useEffect, useState } from 'react';

export type ViewportBreakpoint = 'phone' | 'tablet' | 'desktop';

const PHONE_QUERY = '(max-width: 768px)';
const TABLET_QUERY = '(min-width: 769px) and (max-width: 1024px)';

function isWebMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('web-mode');
}

function resolveBreakpoint(
  phoneMedia: MediaQueryList,
  tabletMedia: MediaQueryList,
): ViewportBreakpoint {
  if (phoneMedia.matches) return 'phone';
  if (tabletMedia.matches) return 'tablet';
  return 'desktop';
}

export function useViewportBreakpoint(): ViewportBreakpoint {
  const [breakpoint, setBreakpoint] = useState<ViewportBreakpoint>(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (!isWebMode()) return 'desktop';
    const phone = window.matchMedia(PHONE_QUERY);
    const tablet = window.matchMedia(TABLET_QUERY);
    return resolveBreakpoint(phone, tablet);
  });

  useEffect(() => {
    if (!isWebMode()) return;

    const phone = window.matchMedia(PHONE_QUERY);
    const tablet = window.matchMedia(TABLET_QUERY);

    function handleChange(): void {
      setBreakpoint(resolveBreakpoint(phone, tablet));
    }

    phone.addEventListener('change', handleChange);
    tablet.addEventListener('change', handleChange);

    // Sync in case the media query result changed between render and effect mount.
    setBreakpoint(resolveBreakpoint(phone, tablet));

    return () => {
      phone.removeEventListener('change', handleChange);
      tablet.removeEventListener('change', handleChange);
    };
  }, []);

  return breakpoint;
}
