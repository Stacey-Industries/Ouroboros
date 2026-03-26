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

/** Stop retrying after this many consecutive failures per provider. */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Maximum backoff between retries (30 minutes). */
const MAX_BACKOFF_MS = 30 * 60_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null;
const failureCounts = new Map<AuthProvider, number>();
const skipUntil = new Map<AuthProvider, number>();

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

  // CLI-managed OAuth tokens (e.g. Claude CLI / Max subscription) are refreshed
  // by the CLI itself. The IDE has no client_id to refresh them — skip silently.
  if (provider === 'anthropic') return false;

  return isTokenExpiringSoon(credential.expiresAt);
}

// ---------------------------------------------------------------------------
// Provider-specific refresh
// ---------------------------------------------------------------------------

async function refreshProvider(provider: AuthProvider): Promise<boolean> {
  if (provider !== 'anthropic') return true;

  const failures = failureCounts.get(provider) ?? 0;
  if (failures >= MAX_CONSECUTIVE_FAILURES) return false;

  const until = skipUntil.get(provider) ?? 0;
  if (Date.now() < until) return false;

  log.info(`${TAG} Refreshing ${provider} OAuth token`);

  const result = await refreshAnthropicToken();
  if (!result.success) {
    const newCount = failures + 1;
    failureCounts.set(provider, newCount);
    const backoffMs = Math.min(CHECK_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
    skipUntil.set(provider, Date.now() + backoffMs);
    log.warn(
      `${TAG} Failed to refresh ${provider}: ${result.error} ` +
        `(attempt ${newCount}/${MAX_CONSECUTIVE_FAILURES}, next retry in ${Math.round(backoffMs / 1000)}s)`,
    );
    return false;
  }

  failureCounts.delete(provider);
  skipUntil.delete(provider);
  log.info(`${TAG} Successfully refreshed ${provider} token`);
  return true;
}

// ---------------------------------------------------------------------------
// Refresh cycle
// ---------------------------------------------------------------------------

function isRefreshableState(state: AuthState): boolean {
  return (state.status === 'authenticated' || state.status === 'expired') && state.credentialType === 'oauth';
}

async function handleRefreshOutcome(provider: AuthProvider, ok: boolean): Promise<void> {
  if (ok) {
    emitAuthStateChange({ provider, status: 'authenticated', credentialType: 'oauth' });
    return;
  }
  if ((failureCounts.get(provider) ?? 0) >= MAX_CONSECUTIVE_FAILURES) {
    log.warn(`${TAG} Giving up on ${provider} — re-authentication required`);
    emitAuthStateChange({ provider, status: 'expired', credentialType: 'oauth' });
  }
}

async function tryRefreshState(state: AuthState): Promise<void> {
  const shouldRefresh = await needsRefresh(state.provider);
  if (!shouldRefresh) return;
  try {
    const ok = await refreshProvider(state.provider);
    await handleRefreshOutcome(state.provider, ok);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`${TAG} Refresh error for ${state.provider}: ${msg}`);
  }
}

async function refreshExpiring(states: AuthState[]): Promise<void> {
  for (const state of states) {
    if (!isRefreshableState(state)) continue;
    await tryRefreshState(state);
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
  failureCounts.clear();
  skipUntil.clear();
  log.info(`${TAG} Stopped`);
}

/** Reset failure tracking for a provider (call after successful re-authentication). */
export function resetRefreshFailures(provider: AuthProvider): void {
  failureCounts.delete(provider);
  skipUntil.delete(provider);
}
