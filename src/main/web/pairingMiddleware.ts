/**
 * pairingMiddleware.ts — POST /api/pair route handler factory.
 *
 * Exposes createPairingRouter() which mounts the pairing endpoint behind the
 * mobileAccess.enabled flag. Mount conditionally in webServer.ts when the flag
 * is on.
 *
 * Wave 33a Phase H — full implementation.
 */

import type { Request, Response } from 'express';
import { Router } from 'express';

import { getConfigValue } from '../config';
import log from '../logger';
import { consumePairingTicket } from '../mobileAccess/pairingHandlers';
import { isRateLimited, recordFailedAttempt } from './webAuth';

// ─── Body shape ───────────────────────────────────────────────────────────────

interface PairRequestBody {
  code: string;
  label: string;
  fingerprint: string;
}

// ─── Guard helpers ────────────────────────────────────────────────────────────

function isMobileEnabled(): boolean {
  return Boolean(getConfigValue('mobileAccess')?.enabled);
}

function parseBody(raw: unknown): PairRequestBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : 'Mobile device';
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';
  if (!code) return null;
  return { code, label: label || 'Mobile device', fingerprint };
}

// ─── Error mapping ────────────────────────────────────────────────────────────

type ConsumeError = 'invalid' | 'expired' | 'consumed' | 'rate-limited';

function errorResponse(kind: ConsumeError): { status: number; error: string } {
  switch (kind) {
    case 'rate-limited': return { status: 429, error: 'Rate limited — try again later.' };
    case 'expired': return { status: 401, error: 'Code expired — generate a new code.' };
    case 'consumed': return { status: 401, error: 'Code already used.' };
    default: return { status: 401, error: 'Invalid code.' };
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

function handlePairPost(req: Request, res: Response): void {
  if (!isMobileEnabled()) {
    res.status(404).json({ error: 'Mobile access is not enabled.' });
    return;
  }

  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Rate limited — try again later.' });
    return;
  }

  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: 'Missing pairing code.' });
    return;
  }

  const { code, label, fingerprint } = parsed;
  const result = consumePairingTicket(code, label, fingerprint, ip);

  if ('error' in result) {
    recordFailedAttempt(ip);
    const { status, error } = errorResponse(result.error as ConsumeError);
    log.warn('[pairingMiddleware] pair failed:', result.error, 'ip:', ip);
    res.status(status).json({ error });
    return;
  }

  log.info('[pairingMiddleware] device paired, id:', result.device.id);
  res.json({
    refreshToken: result.refreshToken,
    deviceId: result.device.id,
    capabilities: result.device.capabilities,
  });
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Returns an Express Router that mounts POST /api/pair.
 * Mount conditionally in webServer.ts behind mobileAccess.enabled.
 */
export function createPairingRouter(): Router {
  const router = Router();
  router.post('/api/pair', handlePairPost);
  return router;
}
