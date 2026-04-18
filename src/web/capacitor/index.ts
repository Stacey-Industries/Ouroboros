/**
 * src/web/capacitor/index.ts — façade for all native plugin bridges.
 *
 * Feature-detects Capacitor at runtime. Returns false for isNative() in
 * browser/SSR environments where Capacitor is undefined at module load.
 *
 * Import from here, not from individual files, to keep call-sites clean:
 *   import { isNative, hapticImpact } from 'src/web/capacitor';
 */

export { hapticImpact, hapticSelection } from './nativeHaptics';
export { initKeyboardListeners } from './nativeKeyboard';
export type { ShareOptions } from './nativeShare';
export { nativeShare } from './nativeShare';
export { setStatusBarColor, setStatusBarStyle } from './nativeStatusBar';
export { getSecureValue, removeSecureValue, setSecureValue } from './nativeStorage';

/**
 * SSR-safe wrapper around Capacitor.isNativePlatform().
 * Returns false when the Capacitor runtime is not present (browser / Node).
 */
export function isNative(): boolean {
  try {
    // Dynamic require so this module loads safely in Node/SSR where
    // @capacitor/core registers no native runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Capacitor } = require('@capacitor/core') as {
      Capacitor: { isNativePlatform: () => boolean };
    };
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
