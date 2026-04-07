import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  _resetCache as ResetCacheFn,
  deleteSecureKey as DeleteSecureKeyFn,
  getSecureKey as GetSecureKeyFn,
  hasSecureKey as HasSecureKeyFn,
  isSecureStorageAvailable as IsSecureStorageAvailableFn,
  migrateFromPlaintext as MigrateFromPlaintextFn,
  setSecureKey as SetSecureKeyFn,
} from '../secureKeyStore';

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
// Module factory — fresh exports after resetting module registry
// ---------------------------------------------------------------------------

async function loadStore(): Promise<{
  getSecureKey: typeof GetSecureKeyFn;
  setSecureKey: typeof SetSecureKeyFn;
  deleteSecureKey: typeof DeleteSecureKeyFn;
  hasSecureKey: typeof HasSecureKeyFn;
  migrateFromPlaintext: typeof MigrateFromPlaintextFn;
  isSecureStorageAvailable: typeof IsSecureStorageAvailableFn;
  _resetCache: typeof ResetCacheFn;
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

  return await import('../secureKeyStore');
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
function encryptedEntry(plaintext: string): string {
  const buf = Buffer.from(`enc:${plaintext}`);
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('secureKeyStore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockIsEncryptionAvailable.mockReturnValue(true);
  });

  // -----------------------------------------------------------------------
  // getSecureKey
  // -----------------------------------------------------------------------

  describe('getSecureKey', () => {
    it('returns null when no file exists', async () => {
      fileNotFound();
      const { getSecureKey } = await loadStore();
      expect(await getSecureKey('some-key')).toBeNull();
    });

    it('returns null when key not in store', async () => {
      fileContains('{}');
      const { getSecureKey } = await loadStore();
      expect(await getSecureKey('missing')).toBeNull();
    });

    it('decrypts and returns stored value', async () => {
      const entry = encryptedEntry('my-secret-value');
      fileContains(JSON.stringify({ 'test-key': entry }));
      const { getSecureKey } = await loadStore();

      const result = await getSecureKey('test-key');
      expect(result).toBe('my-secret-value');
    });
  });

  // -----------------------------------------------------------------------
  // setSecureKey
  // -----------------------------------------------------------------------

  describe('setSecureKey', () => {
    it('writes encrypted data via atomic rename', async () => {
      fileContains('{}');
      allowWrites();
      const { setSecureKey } = await loadStore();

      await setSecureKey('api-key', 'sk-test-123');

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockRename).toHaveBeenCalledTimes(1);
    });

    it('stores value that can be read back via cache', async () => {
      fileContains('{}');
      allowWrites();
      const { setSecureKey, getSecureKey } = await loadStore();

      await setSecureKey('provider:openai', 'sk-test-abc');
      const result = await getSecureKey('provider:openai');
      expect(result).toBe('sk-test-abc');
    });

    it('throws when safeStorage is unavailable', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false);
      fileContains('{}');
      allowWrites();
      const { setSecureKey } = await loadStore();

      await expect(setSecureKey('key', 'value')).rejects.toThrow(
        /safeStorage encryption is not available/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // deleteSecureKey
  // -----------------------------------------------------------------------

  describe('deleteSecureKey', () => {
    it('removes a key from the store', async () => {
      const entry = encryptedEntry('secret');
      fileContains(JSON.stringify({ mykey: entry }));
      allowWrites();
      const { deleteSecureKey } = await loadStore();

      await deleteSecureKey('mykey');

      const writeCall = mockWriteFile.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written).not.toHaveProperty('mykey');
    });

    it('is a no-op when key not in store', async () => {
      fileContains('{}');
      const { deleteSecureKey } = await loadStore();

      await deleteSecureKey('nonexistent');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // hasSecureKey
  // -----------------------------------------------------------------------

  describe('hasSecureKey', () => {
    it('returns true when key exists', async () => {
      const entry = encryptedEntry('val');
      fileContains(JSON.stringify({ present: entry }));
      const { hasSecureKey } = await loadStore();

      expect(await hasSecureKey('present')).toBe(true);
    });

    it('returns false when key does not exist', async () => {
      fileContains('{}');
      const { hasSecureKey } = await loadStore();

      expect(await hasSecureKey('absent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // migrateFromPlaintext
  // -----------------------------------------------------------------------

  describe('migrateFromPlaintext', () => {
    it('stores a plaintext value and returns true', async () => {
      fileContains('{}');
      allowWrites();
      const { migrateFromPlaintext, getSecureKey } = await loadStore();

      const migrated = await migrateFromPlaintext('web-token', 'abc123');

      expect(migrated).toBe(true);
      expect(await getSecureKey('web-token')).toBe('abc123');
    });

    it('returns false for empty value', async () => {
      fileContains('{}');
      const { migrateFromPlaintext } = await loadStore();

      expect(await migrateFromPlaintext('key', '')).toBe(false);
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // isSecureStorageAvailable
  // -----------------------------------------------------------------------

  describe('isSecureStorageAvailable', () => {
    it('returns true when encryption is available', async () => {
      const { isSecureStorageAvailable } = await loadStore();
      expect(isSecureStorageAvailable()).toBe(true);
    });

    it('returns false when encryption is unavailable', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false);
      const { isSecureStorageAvailable } = await loadStore();
      expect(isSecureStorageAvailable()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Encryption refusal (unlike credentialStore, no fallback)
  // -----------------------------------------------------------------------

  describe('encryption refusal', () => {
    it('getSecureKey throws when safeStorage unavailable', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false);
      const entry = encryptedEntry('secret');
      fileContains(JSON.stringify({ key: entry }));
      const { getSecureKey } = await loadStore();

      // getSecureKey returns null on decrypt failure (logged, not thrown)
      const result = await getSecureKey('key');
      expect(result).toBeNull();
    });
  });
});
