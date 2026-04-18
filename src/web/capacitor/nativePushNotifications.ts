/**
 * nativePushNotifications.ts — native push notification registration bridge.
 *
 * On native (Android/iOS): requests permission, registers with FCM/APNs, and
 * resolves with the device token once the Capacitor `registration` event fires.
 * On web/browser: resolves immediately with { status: 'unavailable' }.
 *
 * Dynamic import keeps @capacitor/push-notifications out of the web bundle.
 *
 * Wave 34 Phase F.
 */

import { isNative } from './index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushRegistrationResult {
  status: 'registered' | 'permission-denied' | 'unavailable';
  token?: string;
  platform?: 'android' | 'ios';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface PushPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(
    event: 'registration',
    handler: (token: { value: string }) => void,
  ): Promise<{ remove(): void }>;
  addListener(
    event: 'registrationError',
    handler: (error: { error: string }) => void,
  ): Promise<{ remove(): void }>;
  removeAllListeners(): Promise<void>;
}

async function importPlugin(): Promise<PushPlugin> {
  const mod = await import('@capacitor/push-notifications');
  return mod.PushNotifications as unknown as PushPlugin;
}

function detectPlatform(): 'android' | 'ios' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Capacitor } = require('@capacitor/core') as {
      Capacitor: { getPlatform(): string };
    };
    const p = Capacitor.getPlatform();
    return p === 'ios' ? 'ios' : 'android';
  } catch {
    return 'android';
  }
}

const REGISTRATION_TIMEOUT_MS = 20_000;

async function waitForToken(plugin: PushPlugin): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let tokenListener: { remove(): void } | null = null;
    let errorListener: { remove(): void } | null = null;

    const timer = setTimeout(() => {
      tokenListener?.remove();
      errorListener?.remove();
      reject(new Error('push-registration-timeout'));
    }, REGISTRATION_TIMEOUT_MS);

    plugin
      .addListener('registration', (token) => {
        clearTimeout(timer);
        errorListener?.remove();
        resolve(token.value);
      })
      .then((l) => { tokenListener = l; })
      .catch(reject);

    plugin
      .addListener('registrationError', (err) => {
        clearTimeout(timer);
        tokenListener?.remove();
        reject(new Error(err.error));
      })
      .then((l) => { errorListener = l; })
      .catch(reject);
  });
}

async function doRegister(plugin: PushPlugin): Promise<PushRegistrationResult> {
  const permission = await plugin.requestPermissions();
  if (permission.receive !== 'granted') {
    return { status: 'permission-denied' };
  }

  await plugin.register();
  const token = await waitForToken(plugin);
  const platform = detectPlatform();
  return { status: 'registered', token, platform };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Requests push notification permission, registers with the platform push
 * service, and returns a typed result.
 *
 * On native: registers and resolves when the token arrives (up to 20 s).
 * On web/browser: resolves immediately with { status: 'unavailable' }.
 * Never throws — all errors are returned as { status: 'unavailable' }.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!isNative()) return { status: 'unavailable' };
  try {
    const plugin = await importPlugin();
    return await doRegister(plugin);
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Removes all push notification listeners. Call on logout or device revocation.
 * No-op on web.
 */
export async function deregisterPushNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    const plugin = await importPlugin();
    await plugin.removeAllListeners();
  } catch {
    // best-effort — ignore errors on deregistration
  }
}
