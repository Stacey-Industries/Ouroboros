import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  deleteCredential as DeleteCredentialFn,
  getAllAuthStates as GetAllAuthStatesFn,
  getCredential as GetCredentialFn,
  hasCredential as HasCredentialFn,
  setCredential as SetCredentialFn,
} from '../credentialStore';

// ---------------------------------------------------------------------------
// Shared mock state — reset per test via vi.resetModules()
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockRename = vi.fn();
const mockMkdir = vi.fn();
const mockIsEncryptionAvailable = vi.fn(() => true);
const mockEncryptString = vi.fn((text: string) => Buffer.from(`enc:${text}`));
const mockDecryptString = vi.fn((buf: Buffer) => {
  const s = buf.toString();
  return s.startsWith('enc:') ? s.slice(4) : s;
});

// ---------------------------------------------------------------------------
// Module factory — returns fresh exports after resetting module registry
// ---------------------------------------------------------------------------

async function loadStore(): Promise<{
  getCredential: typeof GetCredentialFn;
  setCredential: typeof SetCredentialFn;
  deleteCredential: typeof DeleteCredentialFn;
  getAllAuthStates: typeof GetAllAuthStatesFn;
  hasCredential: typeof HasCredentialFn;
}> {
  vi.doMock('electron', () => ({
    app: { getPath: () => '/mock/userData' },
    safeStorage: {
      isEncryptionAvailable: mockIsEncryptionAvailable,
      encryptString: mockEncryptString,
      decryptString: mockDecryptString,
    },
  }));

  vi.doMock('fs/promises', () => ({
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    rename: mockRename,
    mkdir: mockMkdir,
  }));

  vi.doMock('../../logger', () => ({
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  return await import('../credentialStore');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileNotFound(): void {
  mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
}

function fileContains(content: string): void {
  mockReadFile.mockResolvedValueOnce(content);
}

function allowWrites(): void {
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
}

/** Build an encrypted store entry the way the real code does. */
function encryptedEntry(credential: object): string {
  const plain = JSON.stringify(credential);
  const buf = Buffer.from(`enc:${plain}`);
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('credentialStore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockIsEncryptionAvailable.mockReturnValue(true);
  });

  // -----------------------------------------------------------------------
  // getCredential
  // -----------------------------------------------------------------------

  describe('getCredential', () => {
    it('returns null when no file exists', async () => {
      fileNotFound();
      const { getCredential } = await loadStore();

      const result = await getCredential('github');
      expect(result).toBeNull();
    });

    it('returns null when provider not in store', async () => {
      fileContains('{}');
      const { getCredential } = await loadStore();

      const result = await getCredential('github');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // setCredential
  // -----------------------------------------------------------------------

  describe('setCredential', () => {
    it('writes encrypted data via atomic rename', async () => {
      fileContains('{}');
      allowWrites();
      const { setCredential } = await loadStore();

      const cred = {
        type: 'apikey' as const,
        provider: 'anthropic' as const,
        apiKey: 'sk-ant-test-key',
      };

      await setCredential('anthropic', cred);

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockRename).toHaveBeenCalledTimes(1);
    });

    it('stores credential that can be read back', async () => {
      fileContains('{}');
      allowWrites();
      const { setCredential, getCredential } = await loadStore();

      const cred = {
        type: 'apikey' as const,
        provider: 'anthropic' as const,
        apiKey: 'sk-ant-test-key',
      };

      await setCredential('anthropic', cred);

      // getCredential uses the in-memory cache
      const result = await getCredential('anthropic');
      expect(result).toEqual(cred);
    });
  });

  // -----------------------------------------------------------------------
  // deleteCredential
  // -----------------------------------------------------------------------

  describe('deleteCredential', () => {
    it('removes a provider credential', async () => {
      const entry = encryptedEntry({
        type: 'apikey',
        provider: 'github',
        apiKey: 'ghp_test',
      });
      fileContains(JSON.stringify({ github: entry }));
      allowWrites();
      const { deleteCredential } = await loadStore();

      await deleteCredential('github');

      const writeCall = mockWriteFile.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written).not.toHaveProperty('github');
    });

    it('is a no-op when provider not in store', async () => {
      fileContains('{}');
      const { deleteCredential } = await loadStore();

      await deleteCredential('openai');

      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getAllAuthStates
  // -----------------------------------------------------------------------

  describe('getAllAuthStates', () => {
    it('returns correct states for all 3 providers', async () => {
      fileContains('{}');
      const { getAllAuthStates } = await loadStore();

      const states = await getAllAuthStates();

      expect(states).toHaveLength(3);
      const providers = states.map((s) => s.provider);
      expect(providers).toContain('github');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      for (const s of states) {
        expect(s.status).toBe('unauthenticated');
      }
    });
  });

  // -----------------------------------------------------------------------
  // hasCredential
  // -----------------------------------------------------------------------

  describe('hasCredential', () => {
    it('returns true when provider has credential', async () => {
      const entry = encryptedEntry({
        type: 'apikey',
        provider: 'openai',
        apiKey: 'sk-test',
      });
      fileContains(JSON.stringify({ openai: entry }));
      const { hasCredential } = await loadStore();

      const result = await hasCredential('openai');
      expect(result).toBe(true);
    });

    it('returns false when provider has no credential', async () => {
      fileContains('{}');
      const { hasCredential } = await loadStore();

      const result = await hasCredential('github');
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Encryption fallback (safeStorage unavailable)
  // -----------------------------------------------------------------------

  describe('encryption fallback', () => {
    it('uses base64 when safeStorage is unavailable', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false);
      fileContains('{}');
      allowWrites();
      const { setCredential } = await loadStore();

      const cred = {
        type: 'apikey' as const,
        provider: 'openai' as const,
        apiKey: 'sk-fallback-key',
      };

      await setCredential('openai', cred);

      const writeCall = mockWriteFile.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      // When safeStorage is unavailable, plain base64 is used
      const decoded = Buffer.from(written.openai, 'base64').toString('utf-8');
      expect(JSON.parse(decoded)).toEqual(cred);
    });
  });

  // -----------------------------------------------------------------------
  // OAuth expiry detection
  // -----------------------------------------------------------------------

  describe('OAuth expiry detection', () => {
    it('marks expired credential in auth state', async () => {
      const cred = {
        type: 'oauth',
        provider: 'github',
        accessToken: 'gho_expired',
        expiresAt: Date.now() - 60_000,
      };
      const entry = encryptedEntry(cred);
      fileContains(JSON.stringify({ github: entry }));
      const { getAllAuthStates } = await loadStore();

      const states = await getAllAuthStates();
      const gh = states.find((s) => s.provider === 'github');
      expect(gh?.status).toBe('expired');
    });

    it('marks valid OAuth as authenticated', async () => {
      const cred = {
        type: 'oauth',
        provider: 'github',
        accessToken: 'gho_valid',
        expiresAt: Date.now() + 3_600_000,
      };
      const entry = encryptedEntry(cred);
      fileContains(JSON.stringify({ github: entry }));
      const { getAllAuthStates } = await loadStore();

      const states = await getAllAuthStates();
      const gh = states.find((s) => s.provider === 'github');
      expect(gh?.status).toBe('authenticated');
    });
  });
});
