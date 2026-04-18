/**
 * webAuth.ts — Token-based authentication for web remote access.
 *
 * Provides token generation, validation, rate limiting, and a login page
 * for the web server. Uses constant-time comparison to prevent timing attacks.
 */

import crypto from 'crypto';

import { getSecureKeySync, setSecureKey } from '../auth/secureKeyStore';
import { getConfigValue } from '../config';
import { consumePairingTicket } from '../mobileAccess/pairingHandlers';
import { findByTokenHash } from '../mobileAccess/tokenStore';
import type { PairedDevice } from '../mobileAccess/types';

// ─── Token Management ────────────────────────────────────────────────────────

/**
 * Returns the existing web access token, or generates and persists a new one.
 * Reads from SecureKeyStore (encrypted), falling back to config for pre-migration installs.
 */
export function getOrCreateWebToken(): string {
  const fromStore = getSecureKeySync('web-access-token');
  if (fromStore) return fromStore;

  // Fallback: pre-migration config value
  const fromConfig = getConfigValue('webAccessToken');
  if (fromConfig) return fromConfig as string;

  // Generate new token and persist to SecureKeyStore
  const token = crypto.randomBytes(32).toString('hex');
  void setSecureKey('web-access-token', token);
  return token;
}

/**
 * Validates a provided token against the stored token using constant-time
 * comparison to prevent timing side-channel attacks.
 */
export function validateToken(provided: string): boolean {
  if (!provided || typeof provided !== 'string') return false;

  const expected = getOrCreateWebToken();
  if (provided.length !== expected.length) return false;

  try {
    const providedBuf = Buffer.from(provided, 'utf-8');
    const expectedBuf = Buffer.from(expected, 'utf-8');
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Returns true if a web access password has been configured.
 */
export function hasPasswordConfigured(): boolean {
  const password = getSecureKeySync('web-access-password') ?? getConfigValue('webAccessPassword');
  return typeof password === 'string' && password.length > 0;
}

/**
 * Validates a provided password against the stored password.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function validatePassword(provided: string): boolean {
  if (!provided || typeof provided !== 'string') return false;

  const expected = getSecureKeySync('web-access-password') ?? getConfigValue('webAccessPassword');
  if (!expected || typeof expected !== 'string' || expected.length === 0) {
    return false;
  }

  if (provided.length !== expected.length) return false;

  try {
    const providedBuf = Buffer.from(provided, 'utf-8');
    const expectedBuf = Buffer.from(expected, 'utf-8');
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Validates a login credential — tries password first, then token.
 */
export function validateCredential(provided: string): boolean {
  if (hasPasswordConfigured()) {
    return validatePassword(provided);
  }
  return validateToken(provided);
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  firstAttempt: number;
}

const failedAttempts = new Map<string, RateLimitEntry>();

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks whether an IP address has exceeded the rate limit for failed auth attempts.
 * Also cleans up stale entries older than the rate limit window.
 */
export function isRateLimited(ip: string): boolean {
  const now = Date.now();

  // Clean up stale entries
  for (const [key, entry] of failedAttempts) {
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      failedAttempts.delete(key);
    }
  }

  const entry = failedAttempts.get(ip);
  if (!entry) return false;

  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }

  return entry.count >= RATE_LIMIT_MAX_ATTEMPTS;
}

/**
 * Records a failed authentication attempt for the given IP address.
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip);

  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    entry.count++;
  }
}

// ─── WS Ticket Exchange ──────────────────────────────────────────────────────

const WS_TICKET_TTL_MS = 30_000;

interface WsTicketEntry {
  ticket: string; // stored alongside key for timingSafeEqual comparison
  expiresAt: number;
}

const wsTickets = new Map<string, WsTicketEntry>();

/**
 * Creates a short-lived, single-use WS upgrade ticket (32-byte random hex).
 * Opportunistically evicts expired entries at insertion time.
 */
export function createWsTicket(): { ticket: string; expiresInMs: number } {
  const now = Date.now();
  // Opportunistic eviction of expired tickets
  for (const [key, entry] of wsTickets) {
    if (now >= entry.expiresAt) wsTickets.delete(key);
  }
  const ticket = crypto.randomBytes(32).toString('hex');
  wsTickets.set(ticket, { ticket, expiresAt: now + WS_TICKET_TTL_MS });
  return { ticket, expiresInMs: WS_TICKET_TTL_MS };
}

/**
 * Validates and consumes a WS ticket. Returns true if the ticket is valid,
 * unused, and not expired. Deletes the ticket on success (single-use).
 * Map.get uses exact equality; timingSafeEqual guards against length-oracle
 * attacks on the retrieved key comparison.
 */
export function consumeWsTicket(provided: string): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const entry = wsTickets.get(provided);
  if (!entry) return false;
  if (Date.now() >= entry.expiresAt) {
    wsTickets.delete(provided);
    return false;
  }
  // Timing-safe comparison: compare provided against the stored ticket value
  try {
    const providedBuf = Buffer.from(provided, 'utf-8');
    const storedBuf = Buffer.from(entry.ticket, 'utf-8');
    if (providedBuf.length !== storedBuf.length) return false;
    if (!crypto.timingSafeEqual(providedBuf, storedBuf)) return false;
  } catch {
    return false;
  }
  wsTickets.delete(provided);
  return true;
}

/**
 * Returns count of currently active (non-expired) WS tickets.
 * For tests and diagnostics only.
 */
export function getWsTicketStats(): { active: number } {
  const now = Date.now();
  let active = 0;
  for (const entry of wsTickets.values()) {
    if (now < entry.expiresAt) active++;
  }
  return { active };
}

// ─── Mobile Device Verification ─────────────────────────────────────────────

/**
 * Verifies a raw device refresh token against the persisted device list.
 *
 * If the mobileAccess feature flag is off, returns { device: null, reason }
 * immediately — the caller must fall through to the legacy single-token path.
 * NEVER logs the raw token.
 */
export function verifyRefreshToken(
  rawToken: string,
): { device: PairedDevice | null; reason?: string } {
  const mobileAccess = getConfigValue('mobileAccess');
  if (!mobileAccess?.enabled) {
    return { device: null, reason: 'mobile-access-disabled' };
  }
  if (!rawToken || typeof rawToken !== 'string') {
    return { device: null, reason: 'missing-token' };
  }
  const device = findByTokenHash(rawToken);
  if (!device) return { device: null, reason: 'token-not-found' };
  return { device };
}

/** Input shape for verifyPairingHandshake. */
export interface PairingHandshakeInput {
  ticketCode: string;
  deviceLabel: string;
  clientFingerprint: string;
  ip: string;
}

/** Result shape for verifyPairingHandshake. */
export interface PairingHandshakeResult {
  device?: PairedDevice;
  refreshToken?: string;
  error?: string;
}

/**
 * Wraps Phase B's consumePairingTicket for use in the WS handshake path.
 * Returns the device + refreshToken on success, or an error reason on failure.
 * NEVER logs the raw refreshToken.
 */
export function verifyPairingHandshake(
  input: PairingHandshakeInput,
): PairingHandshakeResult {
  const { ticketCode, deviceLabel, clientFingerprint, ip } = input;
  const result = consumePairingTicket(ticketCode, deviceLabel, clientFingerprint, ip);
  if ('error' in result) return { error: result.error };
  return { device: result.device, refreshToken: result.refreshToken };
}

// ─── Login Page ──────────────────────────────────────────────────────────────

/**
 * Generates the login page HTML. When a password is configured, the page
 * shows a "Password" field and POSTs to /api/login. Otherwise falls back
 * to the token query-param redirect flow.
 */
function getLoginPageStyles(): string {
  return `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { width: 100%; max-width: 400px; padding: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 600; margin-bottom: 0.5rem; text-align: center; }
    .subtitle { color: #8b949e; text-align: center; margin-bottom: 2rem; font-size: 0.875rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem; color: #c9d1d9; }
    input[type="password"] { width: 100%; padding: 0.625rem 0.75rem; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
    input[type="password"]:focus { border-color: #238636; box-shadow: 0 0 0 3px rgba(35, 134, 54, 0.3); }
    button { width: 100%; padding: 0.625rem 1rem; background: #238636; color: #ffffff; border: 1px solid rgba(240, 246, 252, 0.1); border-radius: 6px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: background 0.2s; margin-top: 0.5rem; }
    button:hover { background: #2ea043; }
    button:active { background: #238636; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { color: #f85149; font-size: 0.8125rem; margin-top: 0.75rem; text-align: center; min-height: 1.25rem; }
    .help { color: #8b949e; font-size: 0.75rem; text-align: center; margin-top: 1.5rem; }
  </style>`;
}

function getLoginPageScript(label: string): string {
  return `<script>
    document.getElementById('login-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var credential = document.getElementById('credential').value.trim();
      if (!credential) { document.getElementById('error').textContent = 'Please enter your ${label.toLowerCase()}.'; return; }
      var btn = document.getElementById('submit-btn');
      btn.disabled = true; btn.textContent = 'Connecting...'; document.getElementById('error').textContent = '';
      fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: credential }) })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.success) { window.location.reload(); }
        else { document.getElementById('error').textContent = data.error || 'Invalid credentials.'; btn.disabled = false; btn.textContent = 'Connect'; }
      })
      .catch(function() { document.getElementById('error').textContent = 'Connection failed. Try again.'; btn.disabled = false; btn.textContent = 'Connect'; });
    });
  </script>`;
}

export function getLoginPageHtml(): string {
  const usePassword = hasPasswordConfigured();
  const label = usePassword ? 'Password' : 'Access Token';
  const placeholder = usePassword ? 'Enter your password' : 'Paste your access token';
  const helpText = usePassword
    ? 'Set your password in IDE Settings &gt; General &gt; Web Access Password'
    : 'Find your token in the IDE console or Settings';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ouroboros IDE</title>
  ${getLoginPageStyles()}
</head>
<body>
  <div class="container">
    <h1>Ouroboros IDE</h1>
    <p class="subtitle">Remote Access</p>
    <form id="login-form">
      <div class="form-group">
        <label for="credential">${label}</label>
        <input type="password" id="credential" name="credential" placeholder="${placeholder}" autocomplete="current-password" autofocus>
      </div>
      <button type="submit" id="submit-btn">Connect</button>
      <div class="error" id="error"></div>
    </form>
    <p class="help">${helpText}</p>
  </div>
  ${getLoginPageScript(label)}
</body>
</html>`;
}
