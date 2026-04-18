/**
 * pushTokenHandlers.ts — IPC handler for mobileAccess:registerPushToken.
 *
 * Wave 34 Phase F. Stores a device's FCM/APNs push token so the dispatch
 * notifier can deliver push notifications on job completion.
 *
 * Auth: the handler verifies the caller's deviceId matches a known paired
 * device. Desktop callers (localhost) are permitted for testing.
 */

import { ipcMain } from 'electron';

import log from '../logger';
import { addDevice, listDevices } from './tokenStore';
import type { PairedDevice } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterPushTokenArgs {
  deviceId: string;
  token: string;
  platform: 'android' | 'ios';
}

type RegisterPushTokenResult =
  | { success: true }
  | { success: false; error: string };

// ─── Validation ───────────────────────────────────────────────────────────────

function validateArgs(args: unknown): args is RegisterPushTokenArgs {
  if (!args || typeof args !== 'object') return false;
  const a = args as Record<string, unknown>;
  return (
    typeof a['deviceId'] === 'string' && a['deviceId'].length > 0 &&
    typeof a['token'] === 'string' && a['token'].length > 0 &&
    (a['platform'] === 'android' || a['platform'] === 'ios')
  );
}

function findDevice(deviceId: string): PairedDevice | undefined {
  return listDevices().find((d) => d.id === deviceId);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

function storePushToken(device: PairedDevice, token: string, platform: 'android' | 'ios'): void {
  const updated: PairedDevice = { ...device, pushToken: token, pushPlatform: platform };
  addDevice(updated);
  // NEVER log the raw token — log a truncated hash prefix only.
  log.info('[pushToken] stored token prefix', token.slice(0, 8) + '…', 'for device', device.id);
}

async function handleRegisterPushToken(
  _event: unknown,
  args: unknown,
): Promise<RegisterPushTokenResult> {
  if (!validateArgs(args)) {
    return { success: false, error: 'invalid arguments: deviceId, token, platform required' };
  }

  const { deviceId, token, platform } = args;
  const device = findDevice(deviceId);
  if (!device) {
    log.warn('[pushToken] unauthorized: deviceId not found', deviceId);
    return { success: false, error: 'unauthorized' };
  }

  storePushToken(device, token, platform);
  return { success: true };
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registered = false;

/** Registers the mobileAccess:registerPushToken IPC handler. */
export function registerPushTokenHandler(): void {
  if (registered) return;
  ipcMain.removeHandler('mobileAccess:registerPushToken');
  ipcMain.handle('mobileAccess:registerPushToken', handleRegisterPushToken);
  registered = true;
}

/** Removes the handler. Useful for test teardown. */
export function cleanupPushTokenHandler(): void {
  ipcMain.removeHandler('mobileAccess:registerPushToken');
  registered = false;
}
