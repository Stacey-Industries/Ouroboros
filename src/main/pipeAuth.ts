/**
 * pipeAuth.ts — Per-session token authentication for named pipe servers.
 *
 * Generates random tokens on app startup for the IDE tool server and hooks
 * server. Tokens are injected into PTY env so only IDE-spawned processes
 * can connect. Each connection must send the token as the first NDJSON line:
 *
 *   {"auth":"<token>"}\n
 *
 * If the first line is not a valid auth message, the connection is rejected.
 */

import crypto from 'crypto';

import log from './logger';

// ---------------------------------------------------------------------------
// Token storage (module-level, per-process lifetime)
// ---------------------------------------------------------------------------

let toolServerToken: string | null = null;
let hooksToken: string | null = null;

/** Generate both tokens. Call once at app startup. */
export function generatePipeTokens(): void {
  toolServerToken = crypto.randomBytes(32).toString('hex');
  hooksToken = crypto.randomBytes(32).toString('hex');
  log.info('[PipeAuth] Tokens generated for tool server and hooks');
}

export function getToolServerToken(): string {
  if (!toolServerToken) generatePipeTokens();
  return toolServerToken!;
}

export function getHooksToken(): string {
  if (!hooksToken) generatePipeTokens();
  return hooksToken!;
}

// ---------------------------------------------------------------------------
// Auth validation
// ---------------------------------------------------------------------------

/**
 * Validate a first-line auth message against the expected token.
 * Returns true if auth passes, false if it fails.
 */
export function validatePipeAuth(line: string, expectedToken: string): boolean {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return typeof parsed.auth === 'string' && parsed.auth === expectedToken;
  } catch {
    return false;
  }
}
