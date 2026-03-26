import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../auth/credentialStore', () => ({
  getCredential: vi.fn(),
  setCredential: vi.fn(),
  deleteCredential: vi.fn(),
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

import { deleteCredential, getCredential, setCredential } from '../../auth/credentialStore';
import {
  logoutAnthropic,
  refreshAnthropicToken,
  setAnthropicApiKey,
} from '../providers/anthropicAuth';
import { getGitHubAuthState, logoutGitHub, startGitHubLogin } from '../providers/githubAuth';
import { logoutOpenAi, setOpenAiApiKey, validateOpenAiApiKey } from '../providers/openaiAuth';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockGetCredential = vi.mocked(getCredential);
const mockSetCredential = vi.mocked(setCredential);
const mockDeleteCredential = vi.mocked(deleteCredential);

// ---------------------------------------------------------------------------
// Env var helpers
// ---------------------------------------------------------------------------

const savedEnv: Record<string, string | undefined> = {};



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
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
});

// ===========================================================================
// GitHub provider tests
// ===========================================================================

describe('githubAuth', () => {
  describe('startGitHubLogin', () => {
    it('reports an error when the device code fetch fails', () => {
      // GITHUB_CLIENT_ID is not required — a bundled default is used.
      // Simulate a network failure by returning a rejected promise from fetch.
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('network error'));

      const callback = vi.fn();
      startGitHubLogin(callback);

      // The callback is invoked asynchronously after the
      // internal initiateDeviceFlow promise rejects.
      return vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('network error'),
          }),
        );
      });
    });
  });

  describe('logoutGitHub', () => {
    it('calls deleteCredential for github', async () => {
      mockDeleteCredential.mockResolvedValueOnce(undefined);

      await logoutGitHub();

      expect(mockDeleteCredential).toHaveBeenCalledWith('github');
    });
  });

  describe('getGitHubAuthState', () => {
    it('returns unauthenticated when no credential', async () => {
      mockGetCredential.mockResolvedValueOnce(null);

      const state = await getGitHubAuthState();

      expect(state.provider).toBe('github');
      expect(state.status).toBe('unauthenticated');
    });
  });
});

// ===========================================================================
// Anthropic provider tests
// ===========================================================================

describe('anthropicAuth', () => {
  describe('setAnthropicApiKey', () => {
    it('rejects invalid format', async () => {
      const result = await setAnthropicApiKey('invalid-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('sk-ant-');
      expect(mockSetCredential).not.toHaveBeenCalled();
    });

    it('rejects key that is only the prefix', async () => {
      const result = await setAnthropicApiKey('sk-ant-');

      expect(result.success).toBe(false);
    });

    it('stores valid key', async () => {
      mockSetCredential.mockResolvedValueOnce(undefined);

      const result = await setAnthropicApiKey('sk-ant-valid-key-123');

      expect(result.success).toBe(true);
      expect(mockSetCredential).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({
          type: 'apikey',
          provider: 'anthropic',
          apiKey: 'sk-ant-valid-key-123',
        }),
      );
    });
  });

  describe('refreshAnthropicToken', () => {
    it('handles successful refresh', async () => {
      mockGetCredential.mockResolvedValueOnce({
        type: 'oauth',
        provider: 'anthropic',
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000,
      });

      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      } as Response);

      mockSetCredential.mockResolvedValueOnce(undefined);

      const result = await refreshAnthropicToken();

      expect(result.success).toBe(true);
      expect(mockSetCredential).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({
          type: 'oauth',
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        }),
      );
    });

    it('handles failed refresh (non-ok response)', async () => {
      mockGetCredential.mockResolvedValueOnce({
        type: 'oauth',
        provider: 'anthropic',
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
      });

      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const result = await refreshAnthropicToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });

    it('fails when no OAuth credential exists', async () => {
      mockGetCredential.mockResolvedValueOnce(null);

      const result = await refreshAnthropicToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No OAuth credential');
    });

    it('fails when no refresh token available', async () => {
      mockGetCredential.mockResolvedValueOnce({
        type: 'oauth',
        provider: 'anthropic',
        accessToken: 'token-without-refresh',
      });

      const result = await refreshAnthropicToken();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token');
    });
  });

  describe('logoutAnthropic', () => {
    it('calls deleteCredential for anthropic', async () => {
      mockDeleteCredential.mockResolvedValueOnce(undefined);

      await logoutAnthropic();

      expect(mockDeleteCredential).toHaveBeenCalledWith('anthropic');
    });
  });
});

// ===========================================================================
// OpenAI provider tests
// ===========================================================================

describe('openaiAuth', () => {
  describe('validateOpenAiApiKey', () => {
    it('rejects invalid format', async () => {
      const result = await validateOpenAiApiKey('invalid');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('sk-');
    });

    it('rejects empty string', async () => {
      const result = await validateOpenAiApiKey('');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('validates key via API call (mock 200)', async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'openai-organization': 'test-org' }),
      } as Response);

      const result = await validateOpenAiApiKey('sk-valid-key-with-length');

      expect(result.valid).toBe(true);
      expect(result.orgName).toBe('test-org');
    });

    it('rejects on 401 response', async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await validateOpenAiApiKey('sk-invalid-key-12345');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('returns valid=true on network error (offline-tolerant)', async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const result = await validateOpenAiApiKey('sk-offline-key-12345');

      expect(result.valid).toBe(true);
      expect(result.error).toContain('Could not reach');
    });
  });

  describe('setOpenAiApiKey', () => {
    it('stores valid key after validation', async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
      } as Response);
      mockSetCredential.mockResolvedValueOnce(undefined);

      const result = await setOpenAiApiKey('sk-valid-key-with-length');

      expect(result.success).toBe(true);
      expect(mockSetCredential).toHaveBeenCalledWith(
        'openai',
        expect.objectContaining({
          type: 'apikey',
          provider: 'openai',
          apiKey: 'sk-valid-key-with-length',
        }),
      );
    });

    it('rejects invalid format without calling API', async () => {
      const result = await setOpenAiApiKey('bad');

      expect(result.success).toBe(false);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(mockSetCredential).not.toHaveBeenCalled();
    });
  });

  describe('logoutOpenAi', () => {
    it('calls deleteCredential for openai', async () => {
      mockDeleteCredential.mockResolvedValueOnce(undefined);

      await logoutOpenAi();

      expect(mockDeleteCredential).toHaveBeenCalledWith('openai');
    });
  });
});
