import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { readFile } from 'fs/promises';

import {
  detectExistingCredentials,
  importClaudeCliCredentials,
  importGitHubCliCredentials,
  importOpenAiCliCredentials,
} from '../cliCredentialImporter';

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Env var helpers
// ---------------------------------------------------------------------------

const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string): void {
  savedEnv[key] = process.env[key]; // eslint-disable-line security/detect-object-injection
  process.env[key] = value; // eslint-disable-line security/detect-object-injection
}

function clearEnv(key: string): void {
  savedEnv[key] = process.env[key]; // eslint-disable-line security/detect-object-injection
  delete process.env[key]; // eslint-disable-line security/detect-object-injection
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key]; // eslint-disable-line security/detect-object-injection
    } else {
      process.env[key] = value; // eslint-disable-line security/detect-object-injection
    }
  }
}

// ---------------------------------------------------------------------------
// Sample content
// ---------------------------------------------------------------------------

const GH_HOSTS_YML = `github.com:
    oauth_token: gho_abc123
    user: testuser
    git_protocol: https
`;

const CLAUDE_CREDENTIALS_JSON = JSON.stringify({
  claudeAiOauth: {
    accessToken: 'claude-access-token',
    refreshToken: 'claude-refresh-token',
    expiresAt: Date.now() + 3_600_000,
  },
});

const CODEX_CONFIG_TOML = `model = "o4-mini"
api_key = "sk-codex-key-123"
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cliCredentialImporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEnv('ANTHROPIC_API_KEY');
    clearEnv('OPENAI_API_KEY');
  });

  afterEach(() => {
    restoreEnv();
  });

  // -------------------------------------------------------------------------
  // detectExistingCredentials
  // -------------------------------------------------------------------------

  describe('detectExistingCredentials', () => {
    it('finds GitHub credentials from hosts.yml', async () => {
      // gh hosts.yml found, others fail
      mockReadFile
        .mockResolvedValueOnce(GH_HOSTS_YML as never) // gh
        .mockRejectedValueOnce(new Error('ENOENT')) // claude
        .mockRejectedValueOnce(new Error('ENOENT')); // codex

      const results = await detectExistingCredentials();
      const gh = results.find((r) => r.provider === 'github');

      expect(gh?.available).toBe(true);
      expect(gh?.source).toContain('gh CLI');
      expect(gh?.source).toContain('testuser');
    });

    it('finds Anthropic credentials from env var', async () => {
      setEnv('ANTHROPIC_API_KEY', 'sk-ant-env-key');
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const results = await detectExistingCredentials();
      const anth = results.find((r) => r.provider === 'anthropic');

      expect(anth?.available).toBe(true);
      expect(anth?.source).toContain('ANTHROPIC_API_KEY');
    });

    it('finds OpenAI credentials from env var', async () => {
      setEnv('OPENAI_API_KEY', 'sk-openai-env-key');
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const results = await detectExistingCredentials();
      const oai = results.find((r) => r.provider === 'openai');

      expect(oai?.available).toBe(true);
      expect(oai?.source).toContain('OPENAI_API_KEY');
    });

    it('returns not-available when files do not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const results = await detectExistingCredentials();

      for (const r of results) {
        expect(r.available).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // importGitHubCliCredentials
  // -------------------------------------------------------------------------

  describe('importGitHubCliCredentials', () => {
    it('extracts OAuth token from hosts.yml', async () => {
      mockReadFile.mockResolvedValueOnce(GH_HOSTS_YML as never);

      const cred = await importGitHubCliCredentials();

      expect(cred).not.toBeNull();
      expect(cred?.type).toBe('oauth');
      expect(cred?.provider).toBe('github');
      if (cred?.type === 'oauth') {
        expect(cred.accessToken).toBe('gho_abc123');
      }
    });

    it('returns null when hosts.yml missing', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const cred = await importGitHubCliCredentials();
      expect(cred).toBeNull();
    });

    it('returns null when no token in hosts.yml', async () => {
      mockReadFile.mockResolvedValueOnce('github.com:\n    git_protocol: https\n' as never);

      const cred = await importGitHubCliCredentials();
      expect(cred).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // importClaudeCliCredentials
  // -------------------------------------------------------------------------

  describe('importClaudeCliCredentials', () => {
    it('prefers env var over file', async () => {
      setEnv('ANTHROPIC_API_KEY', 'sk-ant-from-env');

      const cred = await importClaudeCliCredentials();

      expect(cred).not.toBeNull();
      expect(cred?.type).toBe('apikey');
      if (cred?.type === 'apikey') {
        expect(cred.apiKey).toBe('sk-ant-from-env');
      }
      // readFile should NOT be called — env var short-circuits
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('reads OAuth from credentials.json', async () => {
      mockReadFile.mockResolvedValueOnce(CLAUDE_CREDENTIALS_JSON as never);

      const cred = await importClaudeCliCredentials();

      expect(cred).not.toBeNull();
      expect(cred?.type).toBe('oauth');
      expect(cred?.provider).toBe('anthropic');
      if (cred?.type === 'oauth') {
        expect(cred.accessToken).toBe('claude-access-token');
        expect(cred.refreshToken).toBe('claude-refresh-token');
      }
    });

    it('returns null when no env var and no file', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const cred = await importClaudeCliCredentials();
      expect(cred).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // importOpenAiCliCredentials
  // -------------------------------------------------------------------------

  describe('importOpenAiCliCredentials', () => {
    it('returns ApiKeyCredential from env var', async () => {
      setEnv('OPENAI_API_KEY', 'sk-openai-env');

      const cred = await importOpenAiCliCredentials();

      expect(cred).not.toBeNull();
      expect(cred?.type).toBe('apikey');
      expect(cred?.provider).toBe('openai');
      if (cred?.type === 'apikey') {
        expect(cred.apiKey).toBe('sk-openai-env');
      }
    });

    it('returns ApiKeyCredential from codex config', async () => {
      mockReadFile.mockResolvedValueOnce(CODEX_CONFIG_TOML as never);

      const cred = await importOpenAiCliCredentials();

      expect(cred).not.toBeNull();
      expect(cred?.type).toBe('apikey');
      if (cred?.type === 'apikey') {
        expect(cred.apiKey).toBe('sk-codex-key-123');
      }
    });

    it('returns null when no env var and no file', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const cred = await importOpenAiCliCredentials();
      expect(cred).toBeNull();
    });
  });
});
