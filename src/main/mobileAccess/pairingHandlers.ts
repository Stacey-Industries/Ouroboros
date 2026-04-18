/**
 * pairingHandlers.ts — IPC handlers for the mobile device pairing flow.
 *
 * Provides three IPC-registered handlers (generatePairingCode,
 * listPairedDevices, revokePairedDevice) and one direct export
 * (consumePairingTicket) called only by the WS handshake path in Phase D.
 *
 * Wave 33a Phase B.
 */

import crypto from 'crypto';
import { ipcMain } from 'electron';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

import { getConfigValue, setConfigValue } from '../config';
import log from '../logger';
import { isRateLimited, recordFailedAttempt } from '../web/webAuth';
import { getWebServerPort } from '../web/webServer';
import { disconnectDevice } from './bridgeDisconnect';
import { issueTicket, verifyAndConsume } from './pairingTickets';
import { cleanupPushTokenHandler, registerPushTokenHandler } from './pushTokenHandlers';
import { getTimeoutStats } from './timeoutMetrics';
import { addDevice, hashToken, listDevices, removeDevice } from './tokenStore';
import type { PairedDevice, QrPayload } from './types';

// ─── Fingerprint ─────────────────────────────────────────────────────────────

/** Returns a stable random desktop install fingerprint, generating on first call. */
function getOrCreateFingerprint(): string {
  const existing = getConfigValue('mobileAccess')?.desktopFingerprint;
  if (existing) return existing;

  const fp = crypto.randomBytes(16).toString('hex');
  const current = getConfigValue('mobileAccess') ?? { enabled: false, pairedDevices: [] };
  setConfigValue('mobileAccess', { ...current, desktopFingerprint: fp });
  log.info('[pairing] Generated new desktop fingerprint (hash only logged):', hashToken(fp));
  return fp;
}

// ─── Host detection ──────────────────────────────────────────────────────────

/** Returns the first non-internal IPv4 address, falling back to 127.0.0.1. */
function detectLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const entry of iface) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  log.warn('[pairing] No external IPv4 interface found — falling back to 127.0.0.1');
  return '127.0.0.1';
}

// ─── generatePairingCode ─────────────────────────────────────────────────────

function buildQrPayload(code: string, fingerprint: string): QrPayload {
  const port = getWebServerPort() ?? 7890;
  return { v: 1, host: detectLocalIp(), port, code, fingerprint };
}

function buildQrPairingUrl(payload: QrPayload): string {
  const params = new URLSearchParams({
    host: payload.host,
    port: String(payload.port),
    code: payload.code,
    fingerprint: payload.fingerprint,
  });
  return `ouroboros://pair?${params.toString()}`;
}

async function handleGeneratePairingCode() {
  try {
    const ticket = issueTicket();
    const fingerprint = getOrCreateFingerprint();
    const qrPayload = buildQrPayload(ticket.code, fingerprint);
    const qrPairingUrl = buildQrPairingUrl(qrPayload);
    return { success: true, code: ticket.code, expiresAt: ticket.expiresAt, qrPayload, qrPairingUrl };
  } catch (err) {
    log.error('[pairing] generatePairingCode error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── listPairedDevices ───────────────────────────────────────────────────────

/** Strips the refreshTokenHash before sending device records to the renderer. */
function sanitizeDevice(d: PairedDevice): Omit<PairedDevice, 'refreshTokenHash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional omission of sensitive field
  const { refreshTokenHash, ...safe } = d;
  return safe;
}

async function handleListPairedDevices() {
  try {
    const devices = listDevices().map(sanitizeDevice);
    return { success: true, devices };
  } catch (err) {
    log.error('[pairing] listPairedDevices error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── revokePairedDevice ──────────────────────────────────────────────────────

async function handleRevokePairedDevice(_event: unknown, deviceId: string) {
  if (!deviceId || typeof deviceId !== 'string') {
    return { success: false, error: 'deviceId is required' };
  }
  try {
    const removed = removeDevice(deviceId);
    if (!removed) return { success: false, error: 'Device not found' };
    // TODO(Wave 33a Phase D): Replace stub with real bridge disconnect.
    disconnectDevice(deviceId);
    return { success: true };
  } catch (err) {
    log.error('[pairing] revokePairedDevice error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── consumePairingTicket ────────────────────────────────────────────────────

/** Return types for consumePairingTicket. */
type ConsumeError = { error: 'invalid' | 'expired' | 'consumed' | 'rate-limited' };
type ConsumeSuccess = { device: PairedDevice; refreshToken: string };

function buildDevice(
  label: string,
  clientFingerprint: string,
  tokenHash: string,
): PairedDevice {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    label,
    refreshTokenHash: tokenHash,
    fingerprint: clientFingerprint,
    capabilities: ['paired-read', 'paired-write'],
    issuedAt: now,
    lastSeenAt: now,
  };
}

/**
 * Exchanges a pairing code for a long-lived refresh token and device record.
 *
 * NOT wired as an ipcMain handler — called directly by the WS handshake path
 * in Phase D. The `ip` parameter is supplied by the bridge for rate-limiting.
 */
export function consumePairingTicket(
  code: string,
  deviceLabel: string,
  clientFingerprint: string,
  ip: string,
): ConsumeSuccess | ConsumeError {
  if (isRateLimited(ip)) return { error: 'rate-limited' };

  const ticket = verifyAndConsume(code);
  if (!ticket) {
    recordFailedAttempt(ip);
    return { error: 'invalid' };
  }

  // verifyAndConsume already checks expiry and consumed state before returning
  // a non-null result. The expiry re-check here guards against a race where
  // the clock advanced between verifyAndConsume's check and our read.
  if (Date.now() >= ticket.expiresAt) return { error: 'expired' };

  const refreshToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(refreshToken);
  const device = buildDevice(deviceLabel, clientFingerprint, tokenHash);
  addDevice(device);
  // NEVER log the raw refreshToken — log the hash only.
  log.info('[pairing] Device paired, tokenHash:', tokenHash.slice(0, 8) + '…');
  return { device, refreshToken };
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

/** Registers all desktop-facing IPC mobileAccess handlers. Wave 33a Phase F adds getTimeoutStats. */
export function registerPairingHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.removeHandler('mobileAccess:generatePairingCode');
  ipcMain.handle('mobileAccess:generatePairingCode', handleGeneratePairingCode);
  channels.push('mobileAccess:generatePairingCode');

  ipcMain.removeHandler('mobileAccess:listPairedDevices');
  ipcMain.handle('mobileAccess:listPairedDevices', handleListPairedDevices);
  channels.push('mobileAccess:listPairedDevices');

  ipcMain.removeHandler('mobileAccess:revokePairedDevice');
  ipcMain.handle('mobileAccess:revokePairedDevice', handleRevokePairedDevice);
  channels.push('mobileAccess:revokePairedDevice');

  ipcMain.removeHandler('mobileAccess:getTimeoutStats');
  ipcMain.handle('mobileAccess:getTimeoutStats', () => ({
    success: true,
    stats: getTimeoutStats(),
  }));
  channels.push('mobileAccess:getTimeoutStats');

  // Wave 34 Phase F — push token registration
  registerPushTokenHandler();
  channels.push('mobileAccess:registerPushToken');

  registeredChannels = channels;
  return channels;
}

/** Removes all registered pairing IPC handlers. */
export function cleanupPairingHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
  // Wave 34 Phase F — also reset push token handler's registration guard
  cleanupPushTokenHandler();
}
