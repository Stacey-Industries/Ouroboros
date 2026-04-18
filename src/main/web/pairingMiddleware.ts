/**
 * pairingMiddleware.ts — POST /api/pair route handler factory.
 *
 * Exposes createPairingRouter() which mounts the pairing endpoint behind the
 * mobileAccess.enabled flag. Phase H will call this from webServer.ts when it
 * wires up the full pairing screen flow.
 *
 * Wave 33a Phase D — factory + stub handler. Phase H owns the full implementation.
 */

import type { Request, Response } from 'express';
import { Router } from 'express';

import { getConfigValue } from '../config';
import log from '../logger';

// ─── Handler ─────────────────────────────────────────────────────────────────

function handlePairPost(req: Request, res: Response): void {
  const mobileEnabled = Boolean(getConfigValue('mobileAccess')?.enabled);
  if (!mobileEnabled) {
    res.status(404).json({ error: 'Mobile access is not enabled.' });
    return;
  }

  // Phase H will replace this stub with: parse { code, label, fingerprint },
  // call verifyPairingHandshake, return { refreshToken, deviceId, capabilities }.
  const body = req.body as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : '';
  if (!code) {
    res.status(400).json({ error: 'Missing pairing code.' });
    return;
  }

  log.info('[pairingMiddleware] POST /api/pair — stub; Phase H will complete this');
  res.status(501).json({ error: 'Pairing endpoint not yet fully implemented (Phase H).' });
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
