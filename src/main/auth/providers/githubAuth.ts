/**
 * githubAuth.ts — GitHub Device Flow (RFC 8628) authentication provider.
 */
import log from '../../logger';
import { deleteCredential, getCredential, setCredential } from '../credentialStore';
import type {
  AuthState,
  AuthUser,
  GitHubDeviceFlowInfo,
  GitHubLoginEvent,
  OAuthCredential,
} from '../types';

// -- Public types (re-export from shared for consumers) --------------------

export type { GitHubDeviceFlowInfo, GitHubLoginEvent };
export type GitHubLoginCallback = (event: GitHubLoginEvent) => void;

// -- Constants --------------------------------------------------------------

const PROVIDER = 'github' as const;
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const DEFAULT_SCOPES = 'read:user user:email';
const SLOW_DOWN_PENALTY_MS = 5_000;
const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

// -- Module state -----------------------------------------------------------

let activeAbort: AbortController | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;

// -- Internal types ---------------------------------------------------------

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenSuccess {
  access_token: string;
  token_type: string;
  scope: string;
}

interface TokenPending {
  error: string;
  error_description?: string;
}

type TokenResponse = TokenSuccess | TokenPending;

interface PollContext {
  clientId: string;
  deviceCode: string;
  intervalMs: number;
  signal: AbortSignal;
  callback: GitHubLoginCallback;
}

type PollAction = 'continue' | 'slow_down' | 'terminal';

// -- Helpers: HTTP ----------------------------------------------------------

function getClientId(): string {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) {
    throw new Error(
      'GITHUB_CLIENT_ID is not set. Add it to your environment ' +
        'variables or .env file before using GitHub authentication.',
    );
  }
  return id;
}

async function requestDeviceCode(
  clientId: string,
  signal: AbortSignal,
): Promise<DeviceCodeResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ client_id: clientId, scope: DEFAULT_SCOPES }),
    signal,
  });
  if (!res.ok) throw new Error(`Device code request failed: ${res.status}`);
  return (await res.json()) as DeviceCodeResponse;
}

async function pollTokenOnce(
  clientId: string,
  deviceCode: string,
  signal: AbortSignal,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  return (await res.json()) as TokenResponse;
}

async function fetchGitHubUser(accessToken: string, signal: AbortSignal): Promise<AuthUser> {
  const res = await fetch(USER_URL, {
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) throw new Error(`User request failed: ${res.status}`);
  const data = (await res.json()) as { login: string; email?: string; avatar_url?: string };
  return {
    name: data.login,
    email: data.email ?? undefined,
    avatarUrl: data.avatar_url ?? undefined,
  };
}

// -- Helpers: builders ------------------------------------------------------

function buildCredential(token: string, scopes: string): OAuthCredential {
  return {
    type: 'oauth',
    provider: PROVIDER,
    accessToken: token,
    scopes: scopes ? scopes.split(',').map((s) => s.trim()) : [],
  };
}

function buildAuthState(user: AuthUser): AuthState {
  return { provider: PROVIDER, status: 'authenticated', user, credentialType: 'oauth' };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// -- Helpers: cleanup -------------------------------------------------------

function cleanup(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  activeAbort = null;
}

function isTokenError(resp: TokenResponse): resp is TokenPending {
  return 'error' in resp;
}

function getPollAction(error: string): PollAction {
  if (error === 'authorization_pending') return 'continue';
  if (error === 'slow_down') return 'slow_down';
  return 'terminal';
}

// -- Helpers: poll loop -----------------------------------------------------

function schedulePoll(ctx: PollContext): void {
  activeTimer = setTimeout(() => void executePoll(ctx), ctx.intervalMs);
}

async function onTokenReceived(resp: TokenSuccess, ctx: PollContext): Promise<void> {
  try {
    const credential = buildCredential(resp.access_token, resp.scope);
    await setCredential(PROVIDER, credential);
    const user = await fetchGitHubUser(resp.access_token, ctx.signal);
    log.info(`[GitHubAuth] Authenticated as ${user.name}`);
    ctx.callback({ type: 'authenticated', state: buildAuthState(user) });
  } catch (err: unknown) {
    log.error(`[GitHubAuth] Post-auth error: ${errorMessage(err)}`);
    ctx.callback({ type: 'error', message: errorMessage(err) });
  } finally {
    cleanup();
  }
}

function handlePollResponse(ctx: PollContext, resp: TokenResponse): void {
  if (!isTokenError(resp)) {
    void onTokenReceived(resp, ctx);
    return;
  }
  const action = getPollAction(resp.error);
  if (action === 'continue') {
    schedulePoll(ctx);
  } else if (action === 'slow_down') {
    schedulePoll({ ...ctx, intervalMs: ctx.intervalMs + SLOW_DOWN_PENALTY_MS });
  } else {
    const msg = resp.error_description ?? resp.error;
    log.error(`[GitHubAuth] Poll terminal error: ${msg}`);
    ctx.callback({ type: 'error', message: msg });
    cleanup();
  }
}

function handlePollError(ctx: PollContext, err: unknown): void {
  if (ctx.signal.aborted) {
    ctx.callback({ type: 'cancelled' });
    return;
  }
  log.error(`[GitHubAuth] Poll fetch error: ${errorMessage(err)}`);
  ctx.callback({ type: 'error', message: errorMessage(err) });
  cleanup();
}

async function executePoll(ctx: PollContext): Promise<void> {
  if (ctx.signal.aborted) return;
  try {
    const resp = await pollTokenOnce(ctx.clientId, ctx.deviceCode, ctx.signal);
    handlePollResponse(ctx, resp);
  } catch (err: unknown) {
    handlePollError(ctx, err);
  }
}

// -- Helpers: flow initiation -----------------------------------------------

async function initiateDeviceFlow(
  callback: GitHubLoginCallback,
  abort: AbortController,
): Promise<void> {
  try {
    const clientId = getClientId();
    const dr = await requestDeviceCode(clientId, abort.signal);
    callback({
      type: 'device_code',
      info: {
        userCode: dr.user_code,
        verificationUri: dr.verification_uri,
        expiresIn: dr.expires_in,
      },
    });
    schedulePoll({
      clientId,
      deviceCode: dr.device_code,
      intervalMs: dr.interval * 1_000,
      signal: abort.signal,
      callback,
    });
  } catch (err: unknown) {
    if (abort.signal.aborted) {
      callback({ type: 'cancelled' });
      return;
    }
    log.error(`[GitHubAuth] Device flow initiation failed: ${errorMessage(err)}`);
    callback({ type: 'error', message: errorMessage(err) });
    cleanup();
  }
}

// -- Public API -------------------------------------------------------------

export function startGitHubLogin(callback: GitHubLoginCallback): void {
  cancelGitHubLogin();
  const abort = new AbortController();
  activeAbort = abort;
  void initiateDeviceFlow(callback, abort);
}

export function cancelGitHubLogin(): void {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
}

export async function logoutGitHub(): Promise<void> {
  await deleteCredential(PROVIDER);
  log.info('[GitHubAuth] Logged out');
}

export async function getGitHubAuthState(): Promise<AuthState> {
  const credential = await getCredential(PROVIDER);
  if (!credential || credential.type !== 'oauth') {
    return { provider: PROVIDER, status: 'unauthenticated' };
  }
  try {
    const user = await fetchGitHubUser(credential.accessToken, AbortSignal.timeout(10_000));
    return buildAuthState(user);
  } catch {
    log.warn('[GitHubAuth] Could not fetch user profile — returning authenticated without user');
    return { provider: PROVIDER, status: 'authenticated', credentialType: 'oauth' };
  }
}
