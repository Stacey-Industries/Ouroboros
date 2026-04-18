/**
 * tokenStorage.ts — unified refresh-token + device-fingerprint storage.
 *
 * On native (Android/iOS): delegates to @capacitor/preferences via the
 * nativeStorage bridge → Android Keystore / iOS Keychain.
 * On web/browser: falls back to localStorage.
 *
 * Migration: on the FIRST native call to getRefreshToken(), if a legacy
 * localStorage token is found it is moved to secure storage and the
 * localStorage entry is cleared. The migration runs once per process lifetime.
 *
 * Wave 33b Phase D.
 */

import { getSecureValue, isNative, removeSecureValue, setSecureValue } from './capacitor';

// ─── Keys ────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'ouroboros.refreshToken';
const FINGERPRINT_KEY = 'ouroboros.deviceFingerprint';

// ─── Migration state ─────────────────────────────────────────────────────────

/** Prevents the migration from running more than once per process lifetime. */
let migrationDone = false;

// ─── Internal storage helpers ────────────────────────────────────────────────

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Silently ignore — quota errors should not crash the pairing flow.
  }
}

function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

// ─── Migration ───────────────────────────────────────────────────────────────

async function runMigrationOnce(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  const legacy = lsGet(TOKEN_KEY);
  if (!legacy) return;

  await setSecureValue(TOKEN_KEY, legacy);
  lsRemove(TOKEN_KEY);
  console.warn('[tokenStorage] migrated refresh token to secure storage');
}

// ─── Refresh token API ────────────────────────────────────────────────────────

/** Read the stored refresh token, or null if not present. */
export async function getRefreshToken(): Promise<string | null> {
  if (isNative()) {
    await runMigrationOnce();
    return getSecureValue(TOKEN_KEY);
  }
  return lsGet(TOKEN_KEY);
}

/** Persist the refresh token. */
export async function setRefreshToken(token: string): Promise<void> {
  if (isNative()) {
    await setSecureValue(TOKEN_KEY, token);
    return;
  }
  lsSet(TOKEN_KEY, token);
}

/** Remove the stored refresh token. */
export async function clearRefreshToken(): Promise<void> {
  if (isNative()) {
    await removeSecureValue(TOKEN_KEY);
    return;
  }
  lsRemove(TOKEN_KEY);
}

// ─── Device fingerprint API ───────────────────────────────────────────────────

/**
 * Returns the persistent device fingerprint UUID.
 * Generates and persists one (same storage tier as the token) if absent.
 * The fingerprint never rotates — it survives app reinstalls on web (localStorage)
 * but resets on Android/iOS data clear (Preferences is app-data scoped).
 */
export async function getDeviceFingerprint(): Promise<string> {
  const existing = isNative()
    ? await getSecureValue(FINGERPRINT_KEY)
    : lsGet(FINGERPRINT_KEY);

  if (existing) return existing;

  const fp = crypto.randomUUID();
  if (isNative()) {
    await setSecureValue(FINGERPRINT_KEY, fp);
  } else {
    lsSet(FINGERPRINT_KEY, fp);
  }
  return fp;
}
