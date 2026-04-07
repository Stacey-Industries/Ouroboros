import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';

import log from '../logger';
import type { AuthProvider, AuthState, Credential } from './types';

// ---------------------------------------------------------------------------
// Constants & cache
// ---------------------------------------------------------------------------

const ALL_PROVIDERS: AuthProvider[] = ['github', 'anthropic', 'openai'];

type EncryptedStore = Record<string, string>;

let cache: EncryptedStore | null = null;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getAuthDir(): string {
  return path.join(app.getPath('userData'), 'auth');
}

function getCredentialsPath(): string {
  return path.join(getAuthDir(), 'credentials.enc');
}

function getTmpPath(): string {
  return path.join(getAuthDir(), 'credentials.enc.tmp');
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

function encrypt(plaintext: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plaintext).toString('base64');
  }
  log.warn('[CredentialStore] safeStorage unavailable — falling back to base64 encoding');
  return Buffer.from(plaintext, 'utf-8').toString('base64');
}

function decrypt(encoded: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  }
  log.warn('[CredentialStore] safeStorage unavailable — falling back to base64 decoding');
  return Buffer.from(encoded, 'base64').toString('utf-8');
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
    const raw = await readFile(getCredentialsPath(), 'utf-8');
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
  await rename(tmpPath, getCredentialsPath());

  cache = store;
}

// ---------------------------------------------------------------------------
// Auth state helpers
// ---------------------------------------------------------------------------

function isOAuthExpired(credential: Credential): boolean {
  if (credential.type !== 'oauth') return false;
  if (!credential.expiresAt) return false;
  return Date.now() >= credential.expiresAt;
}

function buildAuthState(provider: AuthProvider, credential: Credential | null): AuthState {
  if (!credential) {
    return { provider, status: 'unauthenticated' };
  }

  const status = isOAuthExpired(credential) ? 'expired' : 'authenticated';
  return { provider, status, credentialType: credential.type };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCredential(provider: AuthProvider): Promise<Credential | null> {
  const store = await readStore();
  // eslint-disable-next-line security/detect-object-injection
  const encoded = store[provider];
  if (!encoded) return null;

  try {
    return JSON.parse(decrypt(encoded)) as Credential;
  } catch (err) {
    log.error(`[CredentialStore] Failed to decrypt credential for ${provider}`, err);
    return null;
  }
}

export async function setCredential(provider: AuthProvider, credential: Credential): Promise<void> {
  const store = await readStore();
  const plaintext = JSON.stringify(credential);

  // eslint-disable-next-line security/detect-object-injection
  store[provider] = encrypt(plaintext);
  await writeStore(store);

  log.info(`[CredentialStore] Credential stored for ${provider}`);
}

export async function deleteCredential(provider: AuthProvider): Promise<void> {
  const store = await readStore();

  if (!(provider in store)) return;

  // eslint-disable-next-line security/detect-object-injection
  delete store[provider];
  await writeStore(store);

  log.info(`[CredentialStore] Credential deleted for ${provider}`);
}

export async function getAllAuthStates(): Promise<AuthState[]> {
  const results: AuthState[] = [];

  for (const provider of ALL_PROVIDERS) {
    const credential = await getCredential(provider);
    results.push(buildAuthState(provider, credential));
  }

  return results;
}

export async function hasCredential(provider: AuthProvider): Promise<boolean> {
  const store = await readStore();
  return provider in store;
}

export function isStorageSecure(): boolean {
  return safeStorage.isEncryptionAvailable();
}
