/**
 * tokenStorage.test.ts — unit tests for the unified token storage module.
 *
 * Covers:
 *  - Web (localStorage) path for all three token operations
 *  - Native (Capacitor) path for all three token operations
 *  - Automatic migration: legacy localStorage token is moved to secure storage
 *    exactly once per process lifetime, then cleared from localStorage
 *  - getDeviceFingerprint: stable UUID across calls, generates + persists if absent
 *
 * Wave 33b Phase D.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => false),
  setSecureValue: vi.fn(async () => undefined),
  getSecureValue: vi.fn(async () => null as string | null),
  removeSecureValue: vi.fn(async () => undefined),
}));

vi.mock('./capacitor', () => ({
  isNative: mocks.isNative,
  setSecureValue: mocks.setSecureValue,
  getSecureValue: mocks.getSecureValue,
  removeSecureValue: mocks.removeSecureValue,
}));

// ─── localStorage stub ────────────────────────────────────────────────────────

const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((k: string) => store[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
  removeItem: vi.fn((k: string) => { delete store[k]; }),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'generated-uuid-1234'),
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  clearRefreshToken,
  getDeviceFingerprint,
  getRefreshToken,
  setRefreshToken,
} from './tokenStorage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetMigration() {
  // Re-import resets the module-level migrationDone flag via vi.resetModules()
  // but that's expensive. Instead we rely on beforeEach clearing the store so
  // there is no legacy token to migrate — meaning subsequent calls are no-ops.
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  Object.keys(store).forEach((k) => delete store[k]);
});

// ─── Web path tests ───────────────────────────────────────────────────────────

describe('tokenStorage — web path (isNative = false)', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(false);
  });

  it('getRefreshToken returns null when nothing stored', async () => {
    const tok = await getRefreshToken();
    expect(tok).toBeNull();
    expect(mocks.getSecureValue).not.toHaveBeenCalled();
  });

  it('setRefreshToken writes to localStorage', async () => {
    await setRefreshToken('web-token-abc');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'ouroboros.refreshToken',
      'web-token-abc',
    );
    expect(mocks.setSecureValue).not.toHaveBeenCalled();
  });

  it('getRefreshToken reads from localStorage', async () => {
    store['ouroboros.refreshToken'] = 'stored-tok';
    const tok = await getRefreshToken();
    expect(tok).toBe('stored-tok');
  });

  it('clearRefreshToken removes from localStorage', async () => {
    store['ouroboros.refreshToken'] = 'to-delete';
    await clearRefreshToken();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('ouroboros.refreshToken');
    expect(store['ouroboros.refreshToken']).toBeUndefined();
    expect(mocks.removeSecureValue).not.toHaveBeenCalled();
  });
});

// ─── Native path tests ────────────────────────────────────────────────────────

describe('tokenStorage — native path (isNative = true)', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    // No legacy token in localStorage → migration is a no-op
  });

  it('setRefreshToken delegates to setSecureValue', async () => {
    await setRefreshToken('native-token-xyz');
    expect(mocks.setSecureValue).toHaveBeenCalledWith(
      'ouroboros.refreshToken',
      'native-token-xyz',
    );
    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });

  it('getRefreshToken delegates to getSecureValue', async () => {
    mocks.getSecureValue.mockResolvedValueOnce('secure-tok');
    const tok = await getRefreshToken();
    expect(mocks.getSecureValue).toHaveBeenCalledWith('ouroboros.refreshToken');
    expect(tok).toBe('secure-tok');
  });

  it('getRefreshToken returns null when secure storage is empty', async () => {
    mocks.getSecureValue.mockResolvedValueOnce(null);
    const tok = await getRefreshToken();
    expect(tok).toBeNull();
  });

  it('clearRefreshToken delegates to removeSecureValue', async () => {
    await clearRefreshToken();
    expect(mocks.removeSecureValue).toHaveBeenCalledWith('ouroboros.refreshToken');
    expect(mockLocalStorage.removeItem).not.toHaveBeenCalled();
  });
});

// ─── Migration tests ──────────────────────────────────────────────────────────
//
// migrationDone is a module-level flag in tokenStorage.ts. To get a fresh module
// with the flag reset to false, each migration test resets the module registry
// and dynamically re-imports tokenStorage.

describe('tokenStorage — migration (native + legacy localStorage token)', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
    // Seed a legacy token in localStorage to trigger migration
    store['ouroboros.refreshToken'] = 'legacy-tok';
    vi.resetModules();
  });

  it('moves legacy token to secure storage on first getRefreshToken', async () => {
    mocks.getSecureValue.mockResolvedValue(null);
    const { getRefreshToken: freshGet } = await import('./tokenStorage');
    await freshGet();
    expect(mocks.setSecureValue).toHaveBeenCalledWith(
      'ouroboros.refreshToken',
      'legacy-tok',
    );
    expect(store['ouroboros.refreshToken']).toBeUndefined();
  });

  it('clears localStorage after migration', async () => {
    mocks.getSecureValue.mockResolvedValue(null);
    const { getRefreshToken: freshGet } = await import('./tokenStorage');
    await freshGet();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('ouroboros.refreshToken');
  });
});

// ─── Device fingerprint tests ─────────────────────────────────────────────────

describe('getDeviceFingerprint — web path', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(false);
  });

  it('generates and persists a UUID when none exists', async () => {
    const fp = await getDeviceFingerprint();
    expect(fp).toBe('generated-uuid-1234');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'ouroboros.deviceFingerprint',
      'generated-uuid-1234',
    );
  });

  it('returns existing fingerprint from localStorage without generating', async () => {
    store['ouroboros.deviceFingerprint'] = 'existing-fp-abc';
    const fp = await getDeviceFingerprint();
    expect(fp).toBe('existing-fp-abc');
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
});

describe('getDeviceFingerprint — native path', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
  });

  it('generates and persists via setSecureValue when absent', async () => {
    mocks.getSecureValue.mockResolvedValueOnce(null);
    const fp = await getDeviceFingerprint();
    expect(fp).toBe('generated-uuid-1234');
    expect(mocks.setSecureValue).toHaveBeenCalledWith(
      'ouroboros.deviceFingerprint',
      'generated-uuid-1234',
    );
  });

  it('returns existing fingerprint from secure storage', async () => {
    mocks.getSecureValue.mockResolvedValueOnce('native-fp-xyz');
    const fp = await getDeviceFingerprint();
    expect(fp).toBe('native-fp-xyz');
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('does not touch localStorage for fingerprint on native', async () => {
    mocks.getSecureValue.mockResolvedValueOnce(null);
    await getDeviceFingerprint();
    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });
});

void resetMigration; // suppress unused-function lint
