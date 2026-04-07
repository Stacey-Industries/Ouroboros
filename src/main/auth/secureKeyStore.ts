/**
 * secureKeyStore.ts — Encrypted key-value store for arbitrary secrets.
 *
 * Mirrors the credentialStore pattern (safeStorage + atomic writes + in-process
 * cache) but stores generic key→string pairs rather than typed Credential objects.
 *
 * Used for: model provider API keys, web access tokens, pipe auth tokens.
 *
 * Unlike credentialStore, this module REFUSES to store secrets when
 * safeStorage is unavailable — no silent base64 fallback.
 */

import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';

import log from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EncryptedStore = Record<string, string>;

// ---------------------------------------------------------------------------
// Constants & cache
// ---------------------------------------------------------------------------

let cache: EncryptedStore | null = null;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getAuthDir(): string {
  return path.join(app.getPath('userData'), 'auth');
}

function getSecretsPath(): string {
  return path.join(getAuthDir(), 'secrets.enc');
}

function getTmpPath(): string {
  return path.join(getAuthDir(), 'secrets.enc.tmp');
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'safeStorage encryption is not available. ' +
        'Secrets cannot be stored securely in this environment. ' +
        'Use environment variables for headless/CI usage.',
    );
  }
}

function encrypt(plaintext: string): string {
  assertEncryptionAvailable();
  return safeStorage.encryptString(plaintext).toString('base64');
}

function decrypt(encoded: string): string {
  assertEncryptionAvailable();
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

async function ensureAuthDir(): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(getAuthDir(), { recursive: true });
}

async function readStore(): Promise<EncryptedStore> {
  if (cache) return cache;

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const raw = await readFile(getSecretsPath(), 'utf-8');
    cache = JSON.parse(raw) as EncryptedStore;
  } catch {
    cache = {};
  }

  return cache;
}

async function writeStore(store: EncryptedStore): Promise<void> {
  await ensureAuthDir();
  const data = JSON.stringify(store, null, 2);
  const tmpPath = getTmpPath();

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(tmpPath, data, 'utf-8');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await rename(tmpPath, getSecretsPath());

  cache = store;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getSecureKey(key: string): Promise<string | null> {
  const store = await readStore();
  // eslint-disable-next-line security/detect-object-injection
  const encoded = store[key];
  if (!encoded) return null;

  try {
    return decrypt(encoded);
  } catch (err) {
    log.error(`[SecureKeyStore] Failed to decrypt key "${key}"`, err);
    return null;
  }
}

export async function setSecureKey(key: string, value: string): Promise<void> {
  const store = await readStore();
  // eslint-disable-next-line security/detect-object-injection
  store[key] = encrypt(value);
  await writeStore(store);
  log.info(`[SecureKeyStore] Key stored: "${key}"`);
}

export async function deleteSecureKey(key: string): Promise<void> {
  const store = await readStore();
  if (!(key in store)) return;

  // eslint-disable-next-line security/detect-object-injection
  delete store[key];
  await writeStore(store);
  log.info(`[SecureKeyStore] Key deleted: "${key}"`);
}

export async function hasSecureKey(key: string): Promise<boolean> {
  const store = await readStore();
  return key in store;
}

/**
 * Migrate a plaintext value into the secure store.
 * Convenience wrapper: encrypts and stores the value, then returns true.
 * Returns false if the value is empty/falsy (nothing to migrate).
 */
export async function migrateFromPlaintext(key: string, plaintextValue: string): Promise<boolean> {
  if (!plaintextValue) return false;
  await setSecureKey(key, plaintextValue);
  return true;
}

/**
 * Returns true if safeStorage encryption is available.
 * Callers can check this before attempting writes to provide
 * user-facing warnings.
 */
export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Synchronous read from the in-process cache only.
 * Returns null if the cache hasn't been populated yet or key doesn't exist.
 * Use this in hot paths where async is impractical (e.g., PTY env building).
 * The cache is populated during startup migration — safe to call after that.
 */
export function getSecureKeySync(key: string): string | null {
  if (!cache) return null;
  // eslint-disable-next-line security/detect-object-injection
  const encoded = cache[key];
  if (!encoded) return null;

  try {
    return decrypt(encoded);
  } catch {
    return null;
  }
}

/**
 * Ensure the cache is populated by reading the store file.
 * Call once at startup before any sync reads are needed.
 */
export async function warmCache(): Promise<void> {
  await readStore();
}

/** Reset the in-process cache — primarily for testing. */
export function _resetCache(): void {
  cache = null;
}
