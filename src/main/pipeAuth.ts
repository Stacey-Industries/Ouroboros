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
import { isMainThread, workerData } from 'worker_threads';

import log from './logger';

// ---------------------------------------------------------------------------
// Token storage (module-level, per-process lifetime)
// ---------------------------------------------------------------------------

interface PipeTokenBundle {
  toolServerToken: string;
  hooksToken: string;
}

let toolServerToken: string | null = null;
let hooksToken: string | null = null;

// Worker threads have their own module scope, so lazy generation would produce
// tokens that don't match the main process's pipe servers. Seed from the
// workerData payload the main process attaches via buildWorkerPipeAuthSeed().
function seedFromWorkerData(): void {
  if (isMainThread) return;
  const seed = (workerData as { __pipeAuth?: PipeTokenBundle } | null)?.__pipeAuth;
  if (!seed) return;
  if (typeof seed.toolServerToken === 'string' && seed.toolServerToken.length > 0) {
    toolServerToken = seed.toolServerToken;
  }
  if (typeof seed.hooksToken === 'string' && seed.hooksToken.length > 0) {
    hooksToken = seed.hooksToken;
  }
}

seedFromWorkerData();

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

/**
 * Build the `workerData` payload for spawning a Worker that transitively
 * imports this module. The worker will adopt the main process's tokens
 * instead of generating its own.
 */
export function buildWorkerPipeAuthSeed(): { __pipeAuth: PipeTokenBundle } {
  return {
    __pipeAuth: {
      toolServerToken: getToolServerToken(),
      hooksToken: getHooksToken(),
    },
  };
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
