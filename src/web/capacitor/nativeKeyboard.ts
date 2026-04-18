/**
 * nativeKeyboard.ts — Capacitor Keyboard plugin bridge.
 *
 * On native (Android/iOS): subscribes to keyboardDidShow/keyboardDidHide and
 * writes the keyboard height to --native-keyboard-height on <html>. Returns a
 * cleanup function that removes both listeners.
 *
 * On web/browser: returns a no-op cleanup. Wave 32's useVisualViewportInsets
 * already sets --keyboard-inset for browser mode. The two vars coexist; Phase G
 * will decide which one the composer CSS consumes.
 *
 * Phase G wires this into the mobile layout shell. This file is bridge only.
 */

import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function setKeyboardHeightVar(px: number): void {
  document.documentElement.style.setProperty('--native-keyboard-height', `${px}px`);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Subscribe to native keyboard show/hide events and keep
 * --native-keyboard-height on <html> in sync.
 *
 * Native: attaches two Capacitor Keyboard listeners.
 * Web: no-op, returns a no-op cleanup.
 *
 * @returns Cleanup function — call it to remove listeners (e.g. on unmount).
 */
export async function initKeyboardListeners(): Promise<() => void> {
  if (!isNativePlatform()) {
    return () => undefined;
  }

  const showHandle = await Keyboard.addListener('keyboardDidShow', (info) => {
    setKeyboardHeightVar(info.keyboardHeight);
  });

  const hideHandle = await Keyboard.addListener('keyboardDidHide', () => {
    setKeyboardHeightVar(0);
  });

  return () => {
    showHandle.remove();
    hideHandle.remove();
  };
}
