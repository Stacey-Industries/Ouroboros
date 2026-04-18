/**
 * nativeStorage.ts — secure key-value storage bridge.
 *
 * On native (Android/iOS): delegates to @capacitor/preferences which maps to
 * Android Keystore / iOS Keychain depending on the OS.
 * On web/browser: falls back to localStorage.
 *
 * Phase D wires this to refresh-token persistence in the pairing screen.
 * This file is the bridge layer only — no callers exist yet.
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Persist a value under `key` in secure storage.
 * Native: @capacitor/preferences (Keystore / Keychain).
 * Web: localStorage.
 */
export async function setSecureValue(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.set({ key, value });
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn('[nativeStorage] localStorage.setItem failed:', err);
  }
}

/**
 * Retrieve the value stored under `key`, or `null` if absent.
 * Native: @capacitor/preferences.
 * Web: localStorage.
 */
export async function getSecureValue(key: string): Promise<string | null> {
  if (isNativePlatform()) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn('[nativeStorage] localStorage.getItem failed:', err);
    return null;
  }
}

/**
 * Remove the value stored under `key`.
 * Native: @capacitor/preferences.
 * Web: localStorage.
 */
export async function removeSecureValue(key: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.remove({ key });
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('[nativeStorage] localStorage.removeItem failed:', err);
  }
}
