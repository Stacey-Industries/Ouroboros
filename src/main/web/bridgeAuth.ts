/**
 * bridgeAuth.ts — WS upgrade and pairing handshake authentication.
 *
 * authenticateUpgrade()         — inspects the Authorization header on the
 *                                 HTTP upgrade request; returns ConnectionMeta
 *                                 on success or null for the legacy path.
 * authenticatePairingHandshake() — validates a pairing ticket from the first
 *                                  WS message; rate-limit checked here.
 *
 * Wave 33a Phase D.
 */

import type { IncomingMessage } from 'http';

import log from '../logger';
import type { MobileAccessMeta } from './bridgeCapabilityGate';
import {
  isRateLimited,
  recordFailedAttempt,
  verifyPairingHandshake,
  verifyRefreshToken,
} from './webAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input from the first WS message for the Pairing scheme. */
export interface PairingHandshakeMessage {
  code: string;
  label: string;
  fingerprint: string;
}

/** Successful pairing handshake result sent back to the client. */
export interface PairingResult {
  refreshToken: string;
  deviceId: string;
  capabilities: readonly string[];
}

export type HandshakeOutcome =
  | { ok: true; meta: MobileAccessMeta; result: PairingResult }
  | { ok: false; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIp(req: IncomingMessage): string {
  return req.socket?.remoteAddress ?? 'unknown';
}

function buildMeta(
  deviceId: string,
  capabilities: readonly string[],
): MobileAccessMeta {
  return {
    deviceId,
    capabilities: capabilities as MobileAccessMeta['capabilities'],
    issuedAt: Date.now(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inspects the Authorization header on the WS upgrade request.
 *
 * - `Bearer <token>` → verifies against device refresh tokens; returns meta or null.
 * - `Pairing <code>` → signals first-connect pairing; returns null (caller must
 *   collect the first WS message and call authenticatePairingHandshake instead).
 * - No header or unrecognised scheme → null (legacy single-token path in caller).
 */
export async function authenticateUpgrade(
  req: IncomingMessage,
): Promise<MobileAccessMeta | null> {
  const authHeader = req.headers.authorization ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    // Covers: no header, Pairing scheme, Basic, etc.
    return null;
  }

  const rawToken = authHeader.slice(7);
  const { device, reason } = verifyRefreshToken(rawToken);
  if (!device) {
    log.warn('[bridgeAuth] upgrade Bearer rejected, reason:', reason);
    return null;
  }

  const meta = buildMeta(device.id, device.capabilities);
  log.info('[bridgeAuth] upgrade authenticated deviceId:', device.id);
  return meta;
}

/**
 * Validates a pairing handshake message from the first WS frame.
 *
 * Rate-limit is checked here (before consuming the ticket) and a failed
 * attempt is recorded on any non-rate-limited failure so brute-force is bounded.
 */
export async function authenticatePairingHandshake(
  msg: PairingHandshakeMessage,
  req: IncomingMessage,
): Promise<HandshakeOutcome> {
  const ip = getIp(req);

  if (isRateLimited(ip)) {
    log.warn('[bridgeAuth] pairing handshake rate-limited for ip:', ip);
    return { ok: false, error: 'rate-limited' };
  }

  const result = verifyPairingHandshake({
    ticketCode: msg.code,
    deviceLabel: msg.label,
    clientFingerprint: msg.fingerprint,
    ip,
  });

  if (result.error || !result.device || !result.refreshToken) {
    recordFailedAttempt(ip);
    log.warn('[bridgeAuth] pairing handshake failed, error:', result.error ?? 'missing-fields');
    return { ok: false, error: result.error ?? 'handshake-failed' };
  }

  const meta = buildMeta(result.device.id, result.device.capabilities);
  const pairingResult: PairingResult = {
    refreshToken: result.refreshToken,
    deviceId: result.device.id,
    capabilities: result.device.capabilities,
  };

  log.info('[bridgeAuth] pairing handshake succeeded deviceId:', result.device.id);
  return { ok: true, meta, result: pairingResult };
}
