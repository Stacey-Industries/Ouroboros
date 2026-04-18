/**
 * nativeStatusBar.ts — status bar theming bridge.
 *
 * IMPORTANT: This file is the canonical boundary where hex color values are
 * legal. The StatusBar native API requires a raw hex string (#RRGGBB). Design
 * token resolution must happen in the CALLER before invoking setStatusBarColor.
 * Do not remove or weaken this annotation — see renderer.md for the token rule.
 *
 * On native (Android/iOS): delegates to @capacitor/status-bar.
 * On web/browser: no-op (status bar concept does not exist in the browser).
 *
 * Phase G wires this to theme-change events in the IDE shell.
 * This file is the bridge layer only — no callers exist yet.
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function toNativeStyle(mode: 'dark' | 'light'): Style {
  return mode === 'dark' ? Style.Dark : Style.Light;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Set the status bar text/icon style (dark text on light background, or vice-versa).
 * Native: @capacitor/status-bar setStyle.
 * Web: no-op.
 *
 * @param mode 'dark' — light icons/text for dark status bars.
 *             'light' — dark icons/text for light status bars.
 */
export async function setStatusBarStyle(mode: 'dark' | 'light'): Promise<void> {
  if (!isNativePlatform()) return;
  await StatusBar.setStyle({ style: toNativeStyle(mode) });
}

/**
 * Set the status bar background color (Android only; ignored on iOS).
 * Native: @capacitor/status-bar setBackgroundColor.
 * Web: no-op.
 *
 * @param hex Raw hex color string, e.g. '#1a1a2e'. Caller is responsible for
 *   resolving design tokens to hex before calling this function.
 *   Hex is explicitly allowed here — this is the token-system boundary.
 */
export async function setStatusBarColor(hex: string): Promise<void> {
  if (!isNativePlatform()) return;
  await StatusBar.setBackgroundColor({ color: hex });
}
