/**
 * authMiddleware.ts — HTTP auth middleware for the web server.
 *
 * Extracted from webServer.ts (Phase D). Handles:
 *  - Legacy single-token path (cookie / query param / Bearer)
 *  - Mobile-access Bearer refresh-token path (when flag is on + non-localhost)
 *
 * Wave 33a Phase D.
 */

import type { NextFunction, Request, Response } from 'express';

import { getConfigValue } from '../config';
import log from '../logger';
import type { PairedDevice } from '../mobileAccess/types';
import {
  getLoginPageHtml,
  isRateLimited,
  recordFailedAttempt,
  validateToken,
  verifyRefreshToken,
} from './webAuth';

// ─── Augment Express Request ─────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      mobileAccessDevice?: PairedDevice;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    }),
  );
}

/**
 * Returns true for loopback addresses: 127.0.0.1, ::1, and the IPv4-mapped
 * IPv6 loopback ::ffff:127.0.0.1.
 */
export function isLocalhost(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function extractToken(req: Request): { token: string; fromQuery: boolean } {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies['webAccessToken'] ?? '';
  const queryToken = (req.query.token as string) ?? '';
  const authHeader = req.headers.authorization ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = cookieToken || queryToken || bearerToken;
  return { token, fromQuery: Boolean(queryToken) };
}

export function handleQueryParamToken(req: Request, res: Response, token: string): void {
  const maxAge = 30 * 24 * 60 * 60;
  res.setHeader('Set-Cookie', [
    `webAccessToken=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
  ]);
  const url = new URL(req.originalUrl, `http://${req.headers.host}`);
  url.searchParams.delete('token');
  res.redirect(302, url.pathname + url.search);
}

export function handleUnauthorized(req: Request, res: Response, ip: string, token: string): void {
  if (token) recordFailedAttempt(ip);
  if (req.headers.accept?.includes('text/html')) {
    res.status(401).type('html').send(getLoginPageHtml());
  } else {
    res.status(401).json({ error: 'Unauthorized. Provide a valid token.' });
  }
}

// ─── Mobile auth branch ───────────────────────────────────────────────────────

function tryMobileAuth(req: Request, res: Response, ip: string): boolean {
  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    handleUnauthorized(req, res, ip, '');
    return false;
  }
  const rawToken = authHeader.slice(7);
  const { device, reason } = verifyRefreshToken(rawToken);
  if (!device) {
    log.warn('[authMiddleware] mobile Bearer rejected, reason:', reason);
    recordFailedAttempt(ip);
    res.status(401).json({ error: 'Unauthorized. Invalid device token.' });
    return false;
  }
  req.mobileAccessDevice = device;
  return true;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware. When mobileAccess is enabled and the request originates
 * from a non-localhost address, the Bearer refresh-token path is used.
 * Otherwise falls through to the legacy single-token path.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    return;
  }

  const mobileEnabled = Boolean(getConfigValue('mobileAccess')?.enabled);

  // Mobile-access path: flag-on + non-localhost
  if (mobileEnabled && !isLocalhost(ip)) {
    const ok = tryMobileAuth(req, res, ip);
    if (!ok) return;
    next();
    return;
  }

  // Legacy single-token path (localhost or flag-off)
  const { token, fromQuery } = extractToken(req);
  if (!validateToken(token)) {
    handleUnauthorized(req, res, ip, token);
    return;
  }

  if (fromQuery) {
    handleQueryParamToken(req, res, token);
    return;
  }

  next();
}
