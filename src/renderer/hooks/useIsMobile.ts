/**
 * useIsMobile — returns true when the viewport is at phone breakpoint (≤768px).
 *
 * Thin wrapper around useViewportBreakpoint. Returns false immediately in
 * Electron (no web-mode class) and during SSR. In web mode, subscribes to
 * breakpoint changes so the component re-renders only on threshold crossings.
 */

import { useViewportBreakpoint } from './useViewportBreakpoint';

export function useIsMobile(): boolean {
  return useViewportBreakpoint() === 'phone';
}
