import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import log from '../logger';
import type { CliCredentialDetection, Credential } from './types';

// Re-export for consumers
export type { CliCredentialDetection };

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getGhHostsPath(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'GitHub CLI', 'hosts.yml');
  }
  return path.join(os.homedir(), '.config', 'gh', 'hosts.yml');
}

function getClaudeCredentialsPath(): string {
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

function getCodexConfigPath(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'codex', 'config.toml');
  }
  return path.join(os.homedir(), '.codex', 'config.toml');
}

// ---------------------------------------------------------------------------
// Safe file reader
// ---------------------------------------------------------------------------

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from os.homedir/env vars
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GitHub CLI credential parsing
// ---------------------------------------------------------------------------

function extractGhToken(content: string): string | null {
  const lines = content.split('\n');
  const tokenLine = lines.find((l) => l.trim().startsWith('oauth_token:'));
  if (!tokenLine) return null;

  const token = tokenLine.split(':').slice(1).join(':').trim();
  return token || null;
}

function extractGhUser(content: string): string | null {
  const lines = content.split('\n');
  const userLine = lines.find((l) => l.trim().startsWith('user:'));
  if (!userLine) return null;

  const user = userLine.split(':').slice(1).join(':').trim();
  return user || null;
}

// ---------------------------------------------------------------------------
// Claude CLI credential parsing
// ---------------------------------------------------------------------------

interface ClaudeOAuthFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

function parseClaudeCredentials(content: string): ClaudeOAuthFile | null {
  try {
    return JSON.parse(content) as ClaudeOAuthFile;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OpenAI / Codex credential parsing
// ---------------------------------------------------------------------------

function extractCodexApiKey(content: string): string | null {
  const lines = content.split('\n');
  const keyLine = lines.find((l) => l.trim().startsWith('api_key'));
  if (!keyLine) return null;

  // Match: api_key = "..." or api_key = '...'
  const match = keyLine.match(/api_key\s*=\s*["']([^"']+)["']/);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Detection (does NOT import — only checks availability)
// ---------------------------------------------------------------------------

async function detectGitHub(): Promise<CliCredentialDetection> {
  const content = await readFileSafe(getGhHostsPath());
  if (content && extractGhToken(content)) {
    const user = extractGhUser(content);
    const detail = user ? ` (user: ${user})` : '';
    return { provider: 'github', available: true, source: `gh CLI${detail}` };
  }
  return { provider: 'github', available: false, source: 'not found' };
}

async function detectClaude(): Promise<CliCredentialDetection> {
  // Check environment variable first
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', available: true, source: 'ANTHROPIC_API_KEY env var' };
  }

  const content = await readFileSafe(getClaudeCredentialsPath());
  if (content) {
    const parsed = parseClaudeCredentials(content);
    if (parsed?.claudeAiOauth?.accessToken) {
      return {
        provider: 'anthropic',
        available: true,
        source: 'Claude CLI (~/.claude/.credentials.json)',
      };
    }
  }

  return { provider: 'anthropic', available: false, source: 'not found' };
}

async function detectOpenAi(): Promise<CliCredentialDetection> {
  // Check environment variable first
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', available: true, source: 'OPENAI_API_KEY env var' };
  }

  const content = await readFileSafe(getCodexConfigPath());
  if (content) {
    const key = extractCodexApiKey(content);
    if (key) {
      return { provider: 'openai', available: true, source: 'Codex CLI config' };
    }
  }

  return { provider: 'openai', available: false, source: 'not found' };
}

// ---------------------------------------------------------------------------
// Public API — detection
// ---------------------------------------------------------------------------

/**
 * Detect which providers have importable CLI credentials.
 * Does NOT import or store credentials — only checks availability.
 */
export async function detectExistingCredentials(): Promise<CliCredentialDetection[]> {
  const results = await Promise.all([detectGitHub(), detectClaude(), detectOpenAi()]);

  for (const r of results) {
    log.debug(`[CliImporter] ${r.provider}: ${r.available ? r.source : 'not found'}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API — import functions
// ---------------------------------------------------------------------------

/**
 * Import GitHub credentials from the `gh` CLI hosts.yml file.
 * Returns an OAuthCredential or null if unavailable.
 */
export async function importGitHubCliCredentials(): Promise<Credential | null> {
  const content = await readFileSafe(getGhHostsPath());
  if (!content) return null;

  const token = extractGhToken(content);
  if (!token) return null;

  log.info('[CliImporter] Imported GitHub credential from gh CLI');
  return { type: 'oauth', provider: 'github', accessToken: token };
}

/**
 * Import Anthropic credentials from the Claude CLI credentials file
 * or the ANTHROPIC_API_KEY environment variable.
 * Returns an OAuthCredential, ApiKeyCredential, or null.
 */
export async function importClaudeCliCredentials(): Promise<Credential | null> {
  // Prefer environment variable — it's the most explicit signal
  if (process.env.ANTHROPIC_API_KEY) {
    log.info('[CliImporter] Imported Anthropic credential from ANTHROPIC_API_KEY env var');
    return { type: 'apikey', provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY };
  }

  return importClaudeOAuthFromFile();
}

async function importClaudeOAuthFromFile(): Promise<Credential | null> {
  const content = await readFileSafe(getClaudeCredentialsPath());
  if (!content) return null;

  const parsed = parseClaudeCredentials(content);
  const oauth = parsed?.claudeAiOauth;
  if (!oauth?.accessToken) return null;

  log.info('[CliImporter] Imported Anthropic credential from Claude CLI');
  return {
    type: 'oauth',
    provider: 'anthropic',
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    expiresAt: oauth.expiresAt,
  };
}

/**
 * Import OpenAI credentials from the OPENAI_API_KEY environment variable
 * or the Codex CLI config.toml file.
 * Returns an ApiKeyCredential or null.
 */
export async function importOpenAiCliCredentials(): Promise<Credential | null> {
  // Prefer environment variable
  if (process.env.OPENAI_API_KEY) {
    log.info('[CliImporter] Imported OpenAI credential from OPENAI_API_KEY env var');
    return { type: 'apikey', provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  }

  return importOpenAiFromCodexConfig();
}

async function importOpenAiFromCodexConfig(): Promise<Credential | null> {
  const content = await readFileSafe(getCodexConfigPath());
  if (!content) return null;

  const key = extractCodexApiKey(content);
  if (!key) return null;

  log.info('[CliImporter] Imported OpenAI credential from Codex CLI config');
  return { type: 'apikey', provider: 'openai', apiKey: key };
}
