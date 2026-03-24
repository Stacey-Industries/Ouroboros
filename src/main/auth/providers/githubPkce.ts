/**
 * githubPkce.ts — PKCE helpers for GitHub OAuth Authorization Code flow.
 *
 * Pure functions for generating PKCE challenges, building authorization URLs,
 * and exchanging authorization codes for tokens. No side effects.
 */
import { GITHUB_PKCE_SCOPES } from '@shared/types/auth';
import { createHash, randomBytes } from 'crypto';

// -- Constants ----------------------------------------------------------------

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

// -- Types --------------------------------------------------------------------

export interface PkceChallenge {
  /** Base64url-encoded random bytes (43 chars). */
  verifier: string;
  /** SHA-256 of the verifier, base64url-encoded. */
  challenge: string;
  /** Random hex nonce for CSRF protection (32 chars). */
  state: string;
}

export interface TokenResult {
  access_token: string;
  token_type: string;
  scope: string;
}

// -- PKCE generation ----------------------------------------------------------

export function generatePkceChallenge(): PkceChallenge {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');
  return { verifier, challenge, state };
}

// -- URL building -------------------------------------------------------------

export function buildAuthorizationUrl(
  clientId: string,
  challenge: string,
  state: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_PKCE_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// -- Token exchange -----------------------------------------------------------

interface ExchangeArgs {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}

export async function exchangeCodeForToken(
  args: ExchangeArgs,
  signal: AbortSignal,
): Promise<TokenResult> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      client_id: args.clientId,
      code: args.code,
      code_verifier: args.verifier,
      redirect_uri: args.redirectUri,
    }),
    signal,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);

  const data = (await res.json()) as TokenResult & { error?: string; error_description?: string };
  if (data.error) {
    throw new Error(data.error_description ?? data.error);
  }
  return { access_token: data.access_token, token_type: data.token_type, scope: data.scope };
}
