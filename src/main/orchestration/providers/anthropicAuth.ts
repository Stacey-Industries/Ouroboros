import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { getCredential } from '../../auth/credentialStore';
import { refreshAnthropicToken } from '../../auth/providers/anthropicAuth';
import type { Credential } from '../../auth/types';
import log from '../../logger';

// ---------------------------------------------------------------------------
// OAuth credential management
// ---------------------------------------------------------------------------

const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

/** Buffer before actual expiry to trigger proactive refresh (5 minutes). */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

const ANTHROPIC_TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';

let cachedCredentials: ClaudeCredentials | null = null;

interface ClaudeOAuthData {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface ClaudeCredentials {
  claudeAiOauth?: ClaudeOAuthData;
  [key: string]: unknown;
}

interface OAuthRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
}

function readCredentials(): ClaudeCredentials | null {
  if (cachedCredentials) return cachedCredentials;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from os.homedir(), not user input
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    cachedCredentials = JSON.parse(raw) as ClaudeCredentials;
    return cachedCredentials;
  } catch {
    return null;
  }
}

function writeCredentials(creds: ClaudeCredentials): void {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from os.homedir(), not user input
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8');
    cachedCredentials = creds;
  } catch (err) {
    log.warn('Failed to write credentials:', err);
  }
}

function isTokenExpired(expiresAt: number | undefined): boolean {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS;
}

async function refreshOAuthToken(refreshToken: string): Promise<ClaudeOAuthData | null> {
  try {
    const response = await fetch(ANTHROPIC_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      log.warn(`OAuth refresh failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as OAuthRefreshResponse;
    if (!data.access_token) return null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    log.warn(
      `OAuth refresh ${isTimeout ? 'timed out' : 'error'}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Ensures the OAuth token is valid, refreshing if needed.
 * Returns the access token or undefined if unavailable.
 */
export async function ensureValidOAuthToken(): Promise<string | undefined> {
  const creds = readCredentials();
  const oauth = creds?.claudeAiOauth;
  if (!oauth?.accessToken) return undefined;

  // Token still valid — use it directly
  if (!isTokenExpired(oauth.expiresAt)) {
    return oauth.accessToken;
  }

  // Token expired or expiring soon — attempt refresh
  if (!oauth.refreshToken) {
    log.warn('OAuth token expired and no refresh token available');
    return undefined;
  }

  log.info('OAuth token expired or expiring soon, refreshing...');
  const refreshed = await refreshOAuthToken(oauth.refreshToken);
  if (!refreshed) {
    log.warn(
      'OAuth refresh failed — token may be expired. Run "claude auth login" to re-authenticate.',
    );
    return undefined;
  }

  // Persist refreshed credentials
  const updatedCreds: ClaudeCredentials = {
    ...creds,
    claudeAiOauth: { ...oauth, ...refreshed },
  };
  writeCredentials(updatedCreds);
  log.info('OAuth token refreshed successfully');
  return refreshed.accessToken;
}

// ---------------------------------------------------------------------------
// Credential store integration
// ---------------------------------------------------------------------------

type CredentialStoreToken =
  | { type: 'apikey'; apiKey: string }
  | { type: 'oauth'; accessToken: string };

function isStoreTokenExpired(credential: Credential): boolean {
  if (credential.type !== 'oauth') return false;
  if (!credential.expiresAt) return false;
  return Date.now() >= credential.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
}

async function tryRefreshStoreToken(credential: Credential): Promise<string | null> {
  if (credential.type !== 'oauth' || !credential.refreshToken) return null;

  log.debug('[credentialStore] OAuth token expired, attempting refresh...');
  const result = await refreshAnthropicToken();
  if (!result.success) {
    log.warn(`[credentialStore] OAuth refresh failed: ${result.error ?? 'unknown'}`);
    return null;
  }

  const refreshed = await getCredential('anthropic');
  return refreshed?.type === 'oauth' ? refreshed.accessToken : null;
}

async function getCredentialStoreToken(): Promise<CredentialStoreToken | null> {
  try {
    const credential = await getCredential('anthropic');
    if (!credential) return null;

    if (credential.type === 'apikey') {
      log.debug('[credentialStore] Using stored API key');
      return { type: 'apikey', apiKey: credential.apiKey };
    }

    // OAuth — check expiry and refresh if needed
    if (!isStoreTokenExpired(credential)) {
      log.debug('[credentialStore] Using stored OAuth token');
      return { type: 'oauth', accessToken: credential.accessToken };
    }

    const refreshedToken = await tryRefreshStoreToken(credential);
    if (refreshedToken) {
      log.debug('[credentialStore] Using refreshed OAuth token');
      return { type: 'oauth', accessToken: refreshedToken };
    }

    return null;
  } catch (err) {
    log.warn('[credentialStore] Error reading credentials, falling through:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export async function createAnthropicClient(): Promise<Anthropic> {
  // 1. Try the credential store first
  const storeToken = await getCredentialStoreToken();
  if (storeToken?.type === 'apikey') {
    return new Anthropic({ apiKey: storeToken.apiKey });
  }
  if (storeToken?.type === 'oauth') {
    return new Anthropic({
      authToken: storeToken.accessToken,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
  }

  // 2. Fallback: environment variable
  log.info('No credential store token — falling back to legacy auth');
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // 3. Fallback: ~/.claude/.credentials.json OAuth
  const oauthToken = await ensureValidOAuthToken();
  if (oauthToken) {
    return new Anthropic({
      authToken: oauthToken,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
  }

  // Let the SDK throw its own descriptive error
  return new Anthropic();
}
