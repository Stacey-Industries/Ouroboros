/**
 * Anthropic authentication provider.
 *
 * Handles API key entry, OAuth token refresh, logout, auth state queries,
 * and Anthropic SDK client creation. This is the single source of Anthropic
 * credentials — consumers should import createAnthropicClient from here.
 */

import Anthropic from '@anthropic-ai/sdk';

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

// ---------------------------------------------------------------------------
// Anthropic SDK client factory
// ---------------------------------------------------------------------------
//
// OAuth subscription tokens (Free / Pro / Max) are explicitly banned from
// third-party SDK use as of Anthropic's April 4, 2026 enforcement — the server
// rejects them with "This credential is only authorized for use with Claude
// Code and cannot be used for other API requests." This factory refuses to
// hand an OAuth token to the SDK client and surfaces a clear error instead.
//
// OAuth tokens remain valid for the CLI-spawn path (`claude -p`), which is
// Anthropic's sanctioned use. That path does NOT go through this function.

const OAUTH_BANNED_MESSAGE =
  'Anthropic subscription OAuth tokens cannot be used with the SDK as of April 4, 2026. ' +
  'Enter an Anthropic API key in Settings (or set ANTHROPIC_API_KEY) to use this feature, ' +
  'or switch the chat to the claude-code (CLI) provider.';

/**
 * Create an Anthropic SDK client using the best available API key credential:
 *   1. Credential store (API key only)
 *   2. ANTHROPIC_API_KEY env var
 *   3. Throw — OAuth tokens are intentionally not accepted here.
 *
 * Callers should surface OAUTH_BANNED_MESSAGE to the user when catching.
 */
export async function createAnthropicClient(): Promise<Anthropic> {
  const credential = await getCredential(PROVIDER);
  if (credential?.type === 'apikey') {
    return new Anthropic({ apiKey: credential.apiKey });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  if (credential?.type === 'oauth') {
    log.warn(
      '[AnthropicAuth] SDK client requested while only OAuth credential available — refusing.',
    );
    throw new Error(OAUTH_BANNED_MESSAGE);
  }
  throw new Error(OAUTH_BANNED_MESSAGE);
}
