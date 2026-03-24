/**
 * protocolHandler.ts — Custom protocol (ouroboros://) handler for OAuth callbacks.
 *
 * Manages the pending PKCE flow state and processes incoming callback URLs
 * from the OS after the user approves in their browser.
 */
import { app } from 'electron';

import log from '../logger';
import { setCredential } from './credentialStore';
import type { GitHubLoginCallback } from './providers/githubAuth';
import { buildAuthState, buildCredential, fetchGitHubUser } from './providers/githubAuth';
import { exchangeCodeForToken } from './providers/githubPkce';

// -- Constants ----------------------------------------------------------------

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const CALLBACK_PREFIX = 'ouroboros://auth/github/callback';

// -- Pending flow state -------------------------------------------------------

export interface PendingPkceFlow {
  state: string;
  verifier: string;
  clientId: string;
  callback: GitHubLoginCallback;
  abort: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
}

let pendingFlow: PendingPkceFlow | null = null;

export function setPendingPkceFlow(flow: Omit<PendingPkceFlow, 'timeoutId'>): void {
  clearPendingPkceFlow();
  const timeoutId = setTimeout(() => {
    log.warn('[ProtocolHandler] PKCE flow timed out after 5 minutes');
    flow.callback({ type: 'error', message: 'Login timed out — please try again' });
    pendingFlow = null;
  }, FLOW_TIMEOUT_MS);
  pendingFlow = { ...flow, timeoutId };
}

export function clearPendingPkceFlow(): void {
  if (pendingFlow) {
    clearTimeout(pendingFlow.timeoutId);
    pendingFlow.abort.abort();
    pendingFlow = null;
  }
}

// -- Protocol registration ----------------------------------------------------

export function registerProtocolHandler(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ouroboros', process.execPath, [process.argv[1]]);
  } else {
    app.setAsDefaultProtocolClient('ouroboros');
  }
  log.info('[ProtocolHandler] Registered ouroboros:// protocol');
}

// -- Callback handling --------------------------------------------------------

function parseCallbackUrl(raw: string): { code: string; state: string } | null {
  if (!raw.startsWith(CALLBACK_PREFIX)) return null;
  try {
    const url = new URL(raw);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    if (error) {
      log.warn(`[ProtocolHandler] GitHub denied: ${error}`);
      return null;
    }
    if (!code || !state) return null;
    return { code, state };
  } catch {
    return null;
  }
}

async function completeTokenExchange(flow: PendingPkceFlow, code: string): Promise<void> {
  try {
    const result = await exchangeCodeForToken(
      flow.clientId,
      code,
      flow.verifier,
      flow.abort.signal,
    );
    const credential = buildCredential(result.access_token, result.scope);
    await setCredential('github', credential);
    const user = await fetchGitHubUser(result.access_token, flow.abort.signal);
    log.info(`[ProtocolHandler] GitHub PKCE authenticated as ${user.name}`);
    flow.callback({ type: 'authenticated', state: buildAuthState(user) });
  } catch (err: unknown) {
    if (flow.abort.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[ProtocolHandler] Token exchange failed: ${msg}`);
    flow.callback({ type: 'error', message: msg });
  }
}

export function handleProtocolUrl(url: string): void {
  const params = parseCallbackUrl(url);
  if (!params) return;

  if (!pendingFlow) {
    log.warn('[ProtocolHandler] Received callback but no pending PKCE flow');
    return;
  }
  if (params.state !== pendingFlow.state) {
    log.warn('[ProtocolHandler] State mismatch — possible CSRF, rejecting');
    pendingFlow.callback({ type: 'error', message: 'Authentication failed — state mismatch' });
    clearPendingPkceFlow();
    return;
  }

  const flow = pendingFlow;
  clearTimeout(flow.timeoutId);
  pendingFlow = null;
  void completeTokenExchange(flow, params.code);
}
