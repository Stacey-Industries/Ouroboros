/**
 * Anthropic authentication provider for the new credential store.
 *
 * Handles API key entry, OAuth token refresh, logout, and auth state queries.
 * This is the NEW auth provider — the existing orchestration-level provider at
 * `src/main/orchestration/providers/anthropicAuth.ts` continues to work as-is.
 * Phase 5 will migrate the orchestration pipeline to read from this store.
 */

import log from '../../logger';
import { deleteCredential, getCredential, setCredential } from '../credentialStore';
import type { AuthState, OAuthCredential } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER = 'anthropic' as const;
const API_KEY_PREFIX = 'sk-ant-';
const TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const REFRESH_TIMEOUT_MS = 10_000;

/** Buffer before actual expiry to report as expired (5 minutes). */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// OAuth refresh response type
// ---------------------------------------------------------------------------

interface OAuthRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

// ---------------------------------------------------------------------------
// API Key Entry
// ---------------------------------------------------------------------------

function isValidApiKeyFormat(apiKey: string): boolean {
  return apiKey.startsWith(API_KEY_PREFIX) && apiKey.length > API_KEY_PREFIX.length;
}

/**
 * Set an Anthropic API key directly (manual entry path).
 * Validates format only — does not make network calls.
 */
export async function setAnthropicApiKey(
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidApiKeyFormat(apiKey)) {
    return { success: false, error: `API key must start with "${API_KEY_PREFIX}"` };
  }

  try {
    await setCredential(PROVIDER, { type: 'apikey', provider: PROVIDER, apiKey });
    log.info('[AnthropicAuth] API key stored successfully');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('[AnthropicAuth] Failed to store API key:', message);
    return { success: false, error: `Failed to store API key: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// OAuth Token Refresh
// ---------------------------------------------------------------------------

async function fetchRefreshedToken(refreshToken: string): Promise<OAuthRefreshResponse | null> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  });

  if (!response.ok) {
    log.warn(`[AnthropicAuth] Token refresh failed: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = (await response.json()) as OAuthRefreshResponse;
  return data.access_token ? data : null;
}

function buildRefreshedCredential(
  existing: OAuthCredential,
  data: OAuthRefreshResponse,
): OAuthCredential {
  return {
    type: 'oauth',
    provider: PROVIDER,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existing.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: existing.scopes,
  };
}

/**
 * Refresh an expired OAuth token. Reads the current credential from the
 * store, refreshes via Anthropic's token endpoint, and persists the result.
 */
export async function refreshAnthropicToken(): Promise<{ success: boolean; error?: string }> {
  const credential = await getCredential(PROVIDER);

  if (!credential || credential.type !== 'oauth') {
    return { success: false, error: 'No OAuth credential found for Anthropic' };
  }

  if (!credential.refreshToken) {
    return { success: false, error: 'No refresh token available' };
  }

  try {
    const data = await fetchRefreshedToken(credential.refreshToken);
    if (!data) {
      return { success: false, error: 'Token refresh request failed' };
    }

    const updated = buildRefreshedCredential(credential, data);
    await setCredential(PROVIDER, updated);

    log.info('[AnthropicAuth] OAuth token refreshed successfully');
    return { success: true };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[AnthropicAuth] Token refresh ${isTimeout ? 'timed out' : 'error'}: ${message}`);
    return { success: false, error: `Token refresh failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/** Delete the Anthropic credential from the store. */
export async function logoutAnthropic(): Promise<void> {
  await deleteCredential(PROVIDER);
  log.info('[AnthropicAuth] Logged out');
}

// ---------------------------------------------------------------------------
// Auth State
// ---------------------------------------------------------------------------

function isTokenExpiringSoon(expiresAt: number | undefined): boolean {
  if (!expiresAt) return false;
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
}

function resolveOAuthStatus(credential: OAuthCredential): AuthState['status'] {
  if (!credential.expiresAt) return 'authenticated';
  return isTokenExpiringSoon(credential.expiresAt) ? 'expired' : 'authenticated';
}

/** Get the current Anthropic auth state from the credential store. */
export async function getAnthropicAuthState(): Promise<AuthState> {
  const credential = await getCredential(PROVIDER);

  if (!credential) {
    return { provider: PROVIDER, status: 'unauthenticated' };
  }

  if (credential.type === 'apikey') {
    return { provider: PROVIDER, status: 'authenticated', credentialType: 'apikey' };
  }

  const status = resolveOAuthStatus(credential);
  return { provider: PROVIDER, status, credentialType: 'oauth' };
}
