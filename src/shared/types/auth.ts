/**
 * shared/types/auth.ts
 *
 * Auth types that cross the main/renderer/preload process boundary.
 * Canonical source for auth types consumed by both sides.
 *
 * The main process (`src/main/auth/types.ts`) re-exports everything from here
 * so existing main-process imports are unaffected.
 */

export type AuthProvider = 'github' | 'anthropic' | 'openai';

export interface OAuthCredential {
  type: 'oauth';
  provider: AuthProvider;
  accessToken: string;
  refreshToken?: string;
  /** Unix millisecond timestamp when the access token expires */
  expiresAt?: number;
  scopes?: string[];
}

export interface ApiKeyCredential {
  type: 'apikey';
  provider: AuthProvider;
  apiKey: string;
}

export type Credential = OAuthCredential | ApiKeyCredential;

export interface AuthUser {
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface AuthState {
  provider: AuthProvider;
  status: 'authenticated' | 'unauthenticated' | 'expired' | 'refreshing';
  user?: AuthUser;
  credentialType?: 'oauth' | 'apikey';
}

/** Event emitted to renderer when auth state changes */
export interface AuthStateChangeEvent {
  provider: AuthProvider;
  state: AuthState;
}

/** Result from CLI credential detection */
export interface CliCredentialDetection {
  provider: AuthProvider;
  available: boolean;
  /** Human-readable description of where credentials were found */
  source: string;
}

/** Information returned to the renderer for GitHub Device Flow */
export interface GitHubDeviceFlowInfo {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

export type GitHubLoginEvent =
  | { type: 'device_code'; info: GitHubDeviceFlowInfo }
  | { type: 'browser_opened'; authUrl: string }
  | { type: 'authenticated'; state: AuthState }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };

/** Custom protocol redirect URI for OAuth callbacks. */
export const GITHUB_REDIRECT_URI = 'ouroboros://auth/github/callback';

/** OAuth scopes for GitHub PKCE flow — includes repo for git push/pull. */
export const GITHUB_PKCE_SCOPES = 'read:user user:email repo';
