/**
 * gitCredentials.ts — Git credential integration.
 *
 * Provides helpers to make the GitHub OAuth token available to PTY spawns
 * via GITHUB_TOKEN/GH_TOKEN environment variables.
 */
import log from '../logger';
import { getCredential } from './credentialStore';

/** Reads the GitHub OAuth token from the credential store. */
export async function getGitHubToken(): Promise<string | null> {
  const credential = await getCredential('github');
  if (!credential || credential.type !== 'oauth') return null;
  return credential.accessToken;
}

/** Called after GitHub login to log token availability. */
export async function configureGitCredentials(): Promise<void> {
  const token = await getGitHubToken();
  if (token) log.info('[GitCredentials] GitHub token available for PTY env injection');
}

/** Called after GitHub logout to log token removal. */
export function clearGitCredentials(): void {
  log.info('[GitCredentials] GitHub token removed from PTY env injection');
}
