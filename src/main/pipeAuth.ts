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
 *
 * Tokens are also persisted to disk ({userData}/session-tokens.json) so that
 * hook scripts from a prior IDE launch can still authenticate after restart.
 * The grace window (60 s) covers in-flight hook invocations straddling the
 * restart. Hook scripts read the file first and fall back to the env var.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isMainThread, workerData } from 'worker_threads';

// ---------------------------------------------------------------------------
// Constant-time token comparison (avoids timing-attack lint warning)
// ---------------------------------------------------------------------------

function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return crypto.timingSafeEqual(bufA, bufB);
}

import log from './logger';

// ---------------------------------------------------------------------------
// Token storage (module-level, per-process lifetime)
// ---------------------------------------------------------------------------

interface PipeTokenBundle {
  toolServerToken: string;
  hooksToken: string;
}

interface PersistedTokens {
  toolToken: string;
  hooksToken: string;
  generatedAt: number;
}

interface PreviousTokenBundle {
  toolServerToken: string;
  hooksToken: string;
  generatedAt: number;
}

const GRACE_WINDOW_MS = 60_000; // 60 s

let toolServerToken: string | null = null;
let hooksToken: string | null = null;
let previousTokens: PreviousTokenBundle | null = null;

// Path is set lazily when the electron app is ready (app.getPath requires it).
let _tokenFilePath: string | null = null;

/** Set the path used for token persistence. Call once during app startup. */
export function setTokenFilePath(userDataPath: string): void {
  _tokenFilePath = path.join(userDataPath, 'session-tokens.json');
}

/** Returns the persisted token file path, or null if not yet set. */
export function getTokenFilePath(): string | null {
  return _tokenFilePath;
}

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

// ---------------------------------------------------------------------------
// Disk persistence
// ---------------------------------------------------------------------------

function writeTokenFile(filePath: string, tokens: PersistedTokens): void {
  try {
    const json = JSON.stringify(tokens);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is constructed from app.getPath('userData'), a trusted system directory
    fs.writeFileSync(filePath, json, { encoding: 'utf8' });
    // On POSIX, restrict to owner-only. Windows inherits user-only ACLs by
    // default under %APPDATA% (userData), so no explicit chmod is needed.
    if (process.platform !== 'win32') {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- same trusted path
      fs.chmodSync(filePath, 0o600);
    }
  } catch (err) {
    log.warn('[PipeAuth] Failed to write token file:', err);
  }
}

/**
 * Read the persisted token file. Returns null if missing, unreadable, or
 * malformed. Exported for tests and future uses.
 */
export function readPersistedTokens(): PersistedTokens | null {
  if (!_tokenFilePath) return null;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    const raw = fs.readFileSync(_tokenFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.toolToken !== 'string' ||
      typeof parsed.hooksToken !== 'string' ||
      typeof parsed.generatedAt !== 'number'
    ) {
      return null;
    }
    return {
      toolToken: parsed.toolToken,
      hooksToken: parsed.hooksToken,
      generatedAt: parsed.generatedAt,
    };
  } catch {
    return null;
  }
}

/** Best-effort delete the persisted token file on app quit. */
export function deleteTokenFile(): void {
  if (!_tokenFilePath) return;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    fs.unlinkSync(_tokenFilePath);
  } catch {
    // Already gone or permission issue — ignore
  }
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/** Generate both tokens. Call once at app startup (after setTokenFilePath). */
export function generatePipeTokens(): void {
  // Archive the current pair before rotating
  if (toolServerToken && hooksToken) {
    previousTokens = {
      toolServerToken,
      hooksToken,
      generatedAt: Date.now(),
    };
  }

  toolServerToken = crypto.randomBytes(32).toString('hex');
  hooksToken = crypto.randomBytes(32).toString('hex');
  log.info('[PipeAuth] Tokens generated for tool server and hooks');

  if (_tokenFilePath) {
    writeTokenFile(_tokenFilePath, {
      toolToken: toolServerToken,
      hooksToken,
      generatedAt: Date.now(),
    });
  }
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

/**
 * Validate a token with a grace window for the previous token pair.
 *
 * Accepts:
 *   1. The current token — always valid.
 *   2. The previous token — valid within GRACE_WINDOW_MS of rotation, to
 *      cover hook invocations straddling an IDE restart.
 *   3. Everything else — rejected.
 */
export function validateTokenWithGrace(kind: 'tool' | 'hooks', token: string): boolean {
  const current = kind === 'tool' ? toolServerToken : hooksToken;
  if (current && safeTokenEqual(token, current)) return true;

  if (previousTokens) {
    const elapsed = Date.now() - previousTokens.generatedAt;
    if (elapsed <= GRACE_WINDOW_MS) {
      const prev =
        kind === 'tool' ? previousTokens.toolServerToken : previousTokens.hooksToken;
      if (safeTokenEqual(token, prev)) return true;
    }
  }

  return false;
}

/**
 * Parse auth line and validate using grace-window logic.
 * Drop-in companion to validatePipeAuth for servers that have a token kind.
 */
export function validatePipeAuthWithGrace(line: string, kind: 'tool' | 'hooks'): boolean {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (typeof parsed.auth !== 'string') return false;
    return validateTokenWithGrace(kind, parsed.auth);
  } catch {
    return false;
  }
}
