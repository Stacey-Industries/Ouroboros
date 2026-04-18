/**
 * useNativeStatusBar.ts — Theme-aware native status bar binding.
 *
 * Subscribes to theme changes and updates the Android/iOS status bar
 * background color and text-icon style to match the active theme.
 *
 * Color is resolved by reading --surface-base from the computed style of
 * <html> after the theme has been applied to the DOM. On native this is the
 * real background; on web it is transparent — so a dark fallback is used.
 *
 * No-op when not running inside Capacitor (isNative() === false).
 * Phase G — mounted once in App.tsx alongside useThemeRuntimeBootstrap.
 */

import { useEffect } from 'react';

import { isNative, setStatusBarColor, setStatusBarStyle } from '../../web/capacitor';
import { useTheme } from './useTheme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert an rgb/rgba CSS string to a #RRGGBB hex string.
 * Falls back to the provided fallback hex when parsing fails or when the
 * computed value is 'transparent' / 'rgba(0,0,0,0)'.
 *
 * Hex is explicitly allowed here — this is the native-boundary token exception
 * documented in nativeStatusBar.ts and renderer.md.
 */
export function rgbStringToHex(rgb: string, fallbackHex: string): string {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgb);
  if (!match) return fallbackHex;
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  // Treat fully transparent as missing
  if (r === 0 && g === 0 && b === 0) {
    const alphaMatch = /rgba\([^,]+,[^,]+,[^,]+,\s*(\d*\.?\d+)/.exec(rgb);
    if (alphaMatch && parseFloat(alphaMatch[1]) === 0) return fallbackHex;
  }
  const hex = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Derive #RRGGBB from the current --surface-base computed value. */
function resolveSurfaceBaseHex(fallbackHex: string): string {
  const computed = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface-base')
    .trim();
  return rgbStringToHex(computed, fallbackHex);
}

/** Light themes by ID — any theme not listed here is treated as dark. */
const LIGHT_THEME_IDS = new Set(['light']);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNativeStatusBar(): void {
  const { theme } = useTheme();

  useEffect(() => {
    if (!isNative()) return;

    const isDark = !LIGHT_THEME_IDS.has(theme.id);
    // Dark theme → dark status bar → white icons (Style.Dark)
    // Light theme → light status bar → dark icons (Style.Light)
    void setStatusBarStyle(isDark ? 'dark' : 'light');

    // hardcoded: native-boundary exception — StatusBar API requires raw hex (see nativeStatusBar.ts).
    // Dark fallback: modern theme bg (#111113). Light fallback: white (#ffffff).
    const fallbackHex = isDark ? '#111113' : '#ffffff'; // hardcoded: native-boundary exception
    const hex = resolveSurfaceBaseHex(fallbackHex);
    void setStatusBarColor(hex);
  }, [theme]);
}
