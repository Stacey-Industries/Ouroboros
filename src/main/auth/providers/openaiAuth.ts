/**
 * openaiAuth.ts — OpenAI API key authentication provider.
 *
 * OpenAI uses API keys (not OAuth) for third-party integrations.
 * This module validates, stores, and manages OpenAI API key credentials
 * via the shared credential store.
 */

import log from '../../logger';
import { deleteCredential, getCredential, setCredential } from '../credentialStore';
import type { AuthState } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAG = '[OpenAI Auth]';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  error?: string;
  orgName?: string;
}

interface SetKeyResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Format check
// ---------------------------------------------------------------------------

function hasValidKeyFormat(apiKey: string): boolean {
  return apiKey.startsWith('sk-') && apiKey.length > 10;
}

// ---------------------------------------------------------------------------
// API validation
// ---------------------------------------------------------------------------

async function callModelsEndpoint(apiKey: string): Promise<ValidationResult> {
  try {
    const response = await fetch(`${OPENAI_MODELS_URL}?limit=1`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      return buildSuccessResult(response);
    }

    return buildErrorResult(response);
  } catch (err) {
    return handleNetworkError(err);
  }
}

function buildSuccessResult(response: Response): ValidationResult {
  const orgName = response.headers.get('openai-organization') ?? undefined;
  log.info(`${TAG} API key validated successfully`);
  return { valid: true, orgName };
}

function buildErrorResult(response: Response): ValidationResult {
  if (response.status === 401 || response.status === 403) {
    log.warn(`${TAG} API key rejected with status ${response.status}`);
    return { valid: false, error: 'Invalid API key — authentication failed' };
  }

  log.warn(`${TAG} Unexpected status ${response.status} during validation`);
  return { valid: false, error: `Unexpected response (HTTP ${response.status})` };
}

function handleNetworkError(err: unknown): ValidationResult {
  const message = err instanceof Error ? err.message : String(err);
  log.warn(`${TAG} Network error during validation: ${message}`);
  // Don't block the user if they're offline — accept the key and validate later
  return {
    valid: true,
    error: 'Could not reach OpenAI API — key stored without online validation',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an OpenAI API key without storing it.
 * Checks format and makes a lightweight API call to confirm it works.
 */
export async function validateOpenAiApiKey(apiKey: string): Promise<ValidationResult> {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API key is required' };
  }

  if (!hasValidKeyFormat(apiKey)) {
    return { valid: false, error: 'Invalid format — OpenAI API keys must start with "sk-"' };
  }

  return callModelsEndpoint(apiKey);
}

/**
 * Validate and store an OpenAI API key in the credential store.
 * Returns success/error based on validation result.
 */
export async function setOpenAiApiKey(apiKey: string): Promise<SetKeyResult> {
  const validation = await validateOpenAiApiKey(apiKey);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  await setCredential('openai', { type: 'apikey', provider: 'openai', apiKey });
  log.info(`${TAG} API key stored successfully`);

  return { success: true };
}

/**
 * Delete the stored OpenAI credential (logout).
 */
export async function logoutOpenAi(): Promise<void> {
  await deleteCredential('openai');
  log.info(`${TAG} Logged out`);
}

/**
 * Get the current OpenAI authentication state from the credential store.
 */
export async function getOpenAiAuthState(): Promise<AuthState> {
  const credential = await getCredential('openai');

  if (!credential) {
    return { provider: 'openai', status: 'unauthenticated' };
  }

  return {
    provider: 'openai',
    status: 'authenticated',
    credentialType: credential.type,
  };
}
