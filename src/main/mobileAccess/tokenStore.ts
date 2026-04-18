/**
 * tokenStore.ts — Persisted device list for mobileAccess.
 *
 * Reads/writes the mobileAccess.pairedDevices slice of electron-store config.
 * Refresh tokens are NEVER stored at rest — only their SHA-256 hash (base64url).
 *
 * Wave 33a Phase A — data model + storage only; no IPC wiring.
 */

import crypto from 'crypto';

import { getConfigValue, setConfigValue } from '../config';
import type { PairedDevice } from './types';

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns all currently paired devices. */
export function listDevices(): PairedDevice[] {
  const access = getConfigValue('mobileAccess');
  return access?.pairedDevices ?? [];
}

/** Persists a new device entry. Replaces any existing entry with the same id. */
export function addDevice(device: PairedDevice): void {
  const current = listDevices().filter((d) => d.id !== device.id);
  writeDevices([...current, device]);
}

/**
 * Removes the device with the given id.
 * @returns true if a device was removed, false if it was not found.
 */
export function removeDevice(deviceId: string): boolean {
  const current = listDevices();
  const next = current.filter((d) => d.id !== deviceId);
  if (next.length === current.length) return false;
  writeDevices(next);
  return true;
}

/**
 * Finds a device whose stored refreshTokenHash matches the SHA-256 of the
 * provided token. Returns undefined when no match is found.
 */
export function findByTokenHash(token: string): PairedDevice | undefined {
  const hash = hashToken(token);
  return listDevices().find((d) => d.refreshTokenHash === hash);
}

/** Updates lastSeenAt for the given device to the current UTC time. */
export function updateLastSeen(deviceId: string): void {
  const devices = listDevices();
  const idx = devices.findIndex((d) => d.id === deviceId);
  if (idx === -1) return;
  // eslint-disable-next-line security/detect-object-injection -- idx is from findIndex, not user input
  devices[idx] = { ...devices[idx], lastSeenAt: new Date().toISOString() };
  writeDevices(devices);
}

/**
 * Hashes a raw token with SHA-256 and returns the result encoded as base64url.
 * base64url uses '-' and '_' instead of '+' and '/', and has no '=' padding —
 * safe for use in HTTP headers and JSON without further escaping.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf-8').digest('base64url');
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function writeDevices(devices: PairedDevice[]): void {
  const current = getConfigValue('mobileAccess') ?? { enabled: false, pairedDevices: [] };
  setConfigValue('mobileAccess', { ...current, pairedDevices: devices });
}
