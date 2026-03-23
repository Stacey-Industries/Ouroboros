/**
 * tokenRefreshManager.ts — Background token refresh for OAuth credentials.
 *
 * Periodically checks all stored credentials for upcoming expiration and
 * proactively refreshes them before they expire. Emits auth state change
 * events to all renderer windows and web clients on successful refresh.
 *
 * Only Anthropic OAuth tokens need refresh — GitHub tokens don't expire by
 * default and OpenAI uses non-expiring API keys.
 */

import log from '../logger';
import { broadcast } from '../web/broadcast';
import { getAllAuthStates, getCredential } from './credentialStore';
import { refreshAnthropicToken } from './providers/anthropicAuth';
import type { AuthProvider, AuthState, AuthStateChangeEvent } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAG = '[TokenRefresh]';

/** How often to check for expiring tokens (ms). */
const CHECK_INTERVAL_MS = 60_000;

/** Refresh tokens that expire within this window (ms). */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitAuthStateChange(state: AuthState): void {
  const event: AuthStateChangeEvent = { provider: state.provider, state };
  broadcast('auth:state-changed', event);
}

function isTokenExpiringSoon(expiresAt: number | undefined): boolean {
  if (!expiresAt) return false;
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
}

async function needsRefresh(provider: AuthProvider): Promise<boolean> {
  const credential = await getCredential(provider);
  if (!credential || credential.type !== 'oauth') return false;
  return isTokenExpiringSoon(credential.expiresAt);
}

// ---------------------------------------------------------------------------
// Provider-specific refresh
// ---------------------------------------------------------------------------

async function refreshProvider(provider: AuthProvider): Promise<void> {
  if (provider !== 'anthropic') return;

  log.info(`${TAG} Refreshing ${provider} OAuth token`);

  const result = await refreshAnthropicToken();
  if (!result.success) {
    log.warn(`${TAG} Failed to refresh ${provider}: ${result.error}`);
    return;
  }

  log.info(`${TAG} Successfully refreshed ${provider} token`);
}

// ---------------------------------------------------------------------------
// Refresh cycle
// ---------------------------------------------------------------------------

async function refreshExpiring(states: AuthState[]): Promise<void> {
  for (const state of states) {
    if (state.status !== 'authenticated' && state.status !== 'expired') continue;
    if (state.credentialType !== 'oauth') continue;

    const shouldRefresh = await needsRefresh(state.provider);
    if (!shouldRefresh) continue;

    try {
      await refreshProvider(state.provider);
      emitAuthStateChange({
        provider: state.provider,
        status: 'authenticated',
        credentialType: 'oauth',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`${TAG} Refresh error for ${state.provider}: ${msg}`);
    }
  }
}

async function runRefreshCycle(): Promise<void> {
  try {
    const states = await getAllAuthStates();
    await refreshExpiring(states);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`${TAG} Refresh cycle error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start the background token refresh manager. */
export function startTokenRefreshManager(): void {
  if (intervalId) {
    log.warn(`${TAG} Already running — ignoring duplicate start`);
    return;
  }

  log.info(`${TAG} Started (interval: ${CHECK_INTERVAL_MS}ms)`);

  // Run an initial check immediately (fire-and-forget)
  runRefreshCycle().catch(() => {
    /* handled inside runRefreshCycle */
  });

  intervalId = setInterval(() => {
    runRefreshCycle().catch(() => {
      /* handled inside runRefreshCycle */
    });
  }, CHECK_INTERVAL_MS);
}

/** Stop the background token refresh manager and clean up. */
export function stopTokenRefreshManager(): void {
  if (!intervalId) return;

  clearInterval(intervalId);
  intervalId = null;
  log.info(`${TAG} Stopped`);
}
