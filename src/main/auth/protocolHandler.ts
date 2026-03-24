/**
 * protocolHandler.ts — Localhost loopback OAuth callback handler.
 *
 * Spins up a temporary HTTP server on 127.0.0.1 to receive the OAuth
 * redirect from GitHub. The server shuts down after receiving the callback.
 * This is the standard pattern for desktop OAuth — GitHub does not support
 * custom protocol schemes (ouroboros://) as redirect URIs.
 */
import http from 'http';

import log from '../logger';
import { setCredential } from './credentialStore';
import type { GitHubLoginCallback } from './providers/githubAuth';
import { buildAuthState, buildCredential, fetchGitHubUser } from './providers/githubAuth';
import { exchangeCodeForToken } from './providers/githubPkce';

// -- Constants ----------------------------------------------------------------

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const SUCCESS_HTML =
  '<html><body><h2>Signed in!</h2><p>You can close this tab and return to Ouroboros.</p></body></html>';
const ERROR_HTML =
  '<html><body><h2>Authentication failed</h2><p>Please return to Ouroboros and try again.</p></body></html>';

// -- Pending flow state -------------------------------------------------------

export interface PendingPkceFlow {
  state: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  callback: GitHubLoginCallback;
  abort: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
  server: http.Server;
}

let pendingFlow: PendingPkceFlow | null = null;

// -- Flow lifecycle -----------------------------------------------------------

export function setPendingPkceFlow(flow: Omit<PendingPkceFlow, 'timeoutId'>): void {
  clearPendingPkceFlow();
  const timeoutId = setTimeout(() => {
    log.warn('[OAuthCallback] PKCE flow timed out after 5 minutes');
    flow.callback({ type: 'error', message: 'Login timed out — please try again' });
    shutdownServer(flow.server);
    pendingFlow = null;
  }, FLOW_TIMEOUT_MS);
  pendingFlow = { ...flow, timeoutId };
}

export function clearPendingPkceFlow(): void {
  if (!pendingFlow) return;
  clearTimeout(pendingFlow.timeoutId);
  pendingFlow.abort.abort();
  shutdownServer(pendingFlow.server);
  pendingFlow = null;
}

function shutdownServer(server: http.Server): void {
  try {
    server.close();
  } catch {
    /* already closed */
  }
}

// -- Callback handling --------------------------------------------------------

function parseCallback(url: string): { code: string; state: string } | null {
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    const error = parsed.searchParams.get('error');
    if (error) {
      log.warn(`[OAuthCallback] GitHub denied: ${error}`);
      return null;
    }
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    if (!code || !state) return null;
    return { code, state };
  } catch {
    return null;
  }
}

async function completeTokenExchange(flow: PendingPkceFlow, code: string): Promise<void> {
  try {
    const result = await exchangeCodeForToken(
      {
        clientId: flow.clientId,
        clientSecret: flow.clientSecret,
        code,
        verifier: flow.verifier,
        redirectUri: flow.redirectUri,
      },
      flow.abort.signal,
    );
    const credential = buildCredential(result.access_token, result.scope);
    await setCredential('github', credential);
    const user = await fetchGitHubUser(result.access_token, flow.abort.signal);
    log.info(`[OAuthCallback] GitHub authenticated as ${user.name}`);
    flow.callback({ type: 'authenticated', state: buildAuthState(user) });
  } catch (err: unknown) {
    if (flow.abort.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[OAuthCallback] Token exchange failed: ${msg}`);
    flow.callback({ type: 'error', message: msg });
  }
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const params = parseCallback(req.url ?? '');
  if (!params || !pendingFlow) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(ERROR_HTML);
    return;
  }
  if (params.state !== pendingFlow.state) {
    log.warn('[OAuthCallback] State mismatch — possible CSRF');
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(ERROR_HTML);
    pendingFlow.callback({ type: 'error', message: 'Authentication failed — state mismatch' });
    clearPendingPkceFlow();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(SUCCESS_HTML);
  const flow = pendingFlow;
  clearTimeout(flow.timeoutId);
  pendingFlow = null;
  shutdownServer(flow.server);
  void completeTokenExchange(flow, params.code);
}

// -- Server creation ----------------------------------------------------------

/** Start a localhost callback server and return the redirect URI. */
export function startCallbackServer(
  flow: Omit<PendingPkceFlow, 'timeoutId' | 'server' | 'redirectUri'>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to bind callback server'));
        return;
      }
      const redirectUri = `http://127.0.0.1:${addr.port}/callback`;
      setPendingPkceFlow({ ...flow, server, redirectUri });
      log.info(`[OAuthCallback] Listening on ${redirectUri}`);
      resolve(redirectUri);
    });
    server.on('error', (err) => {
      reject(err);
    });
  });
}
