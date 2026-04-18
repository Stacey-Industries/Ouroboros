/**
 * usePushRegistration.ts — Wave 34 Phase F.
 *
 * Runs after successful pairing (or on subsequent launches where the app finds
 * a stored refresh token but no stored push token). Calls the native push
 * registration bridge and sends the token to the desktop via IPC.
 *
 * Only active on native (Android/iOS) platforms. No-op on web/desktop.
 */

import { useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsePushRegistrationOptions {
  /** UUID of the paired device. Registration skipped when absent. */
  deviceId: string | undefined;
  /** True once the pairing / auth flow has succeeded for this session. */
  isPaired: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function importBridge() {
  const mod = await import('../../web/capacitor/nativePushNotifications');
  return mod;
}

async function attemptRegistration(deviceId: string): Promise<void> {
  const { registerForPushNotifications } = await importBridge();
  const result = await registerForPushNotifications();

  if (result.status !== 'registered' || !result.token || !result.platform) return;

  await window.electronAPI.mobileAccess.registerPushToken({
    deviceId,
    token: result.token,
    platform: result.platform,
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Registers for push notifications once per mount when the device is paired.
 *
 * - On non-native platforms: no-op (bridge returns `unavailable`).
 * - Runs once per `deviceId` — subsequent renders are guarded by a ref.
 * - Errors are swallowed; push registration is best-effort.
 */
export function usePushRegistration({ deviceId, isPaired }: UsePushRegistrationOptions): void {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isPaired || !deviceId || attemptedRef.current) return;
    attemptedRef.current = true;

    void attemptRegistration(deviceId).catch(() => {
      // best-effort — push registration must not crash the app
    });
  }, [isPaired, deviceId]);
}
