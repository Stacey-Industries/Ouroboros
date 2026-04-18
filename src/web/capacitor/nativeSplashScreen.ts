/**
 * nativeSplashScreen.ts — Capacitor SplashScreen bridge.
 *
 * On native (Android/iOS): delegates to @capacitor/splash-screen.
 * On web/browser: no-op.
 *
 * launchAutoHide is set to false in capacitor.config.ts so that the
 * splash stays visible until the app calls hideSplashScreen() after
 * config + theme bootstrap is complete.
 *
 * Phase G — hide call is mounted once in App.tsx.
 */

import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Hide the native splash screen. No-op in browser.
 * Call after config + theme bootstrap is complete to avoid FOUC.
 */
export async function hideSplashScreen(): Promise<void> {
  if (!isNativePlatform()) return;
  await SplashScreen.hide();
}
