/**
 * nativeStorage.test.ts — tests for the secure key-value storage bridge.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state (must be declared before vi.mock calls) ───────────────

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  preferencesSet: vi.fn(async () => undefined),
  preferencesGet: vi.fn(async () => ({ value: null as string | null })),
  preferencesRemove: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: mocks.preferencesSet,
    get: mocks.preferencesGet,
    remove: mocks.preferencesRemove,
  },
}));

// ─── localStorage stub ───────────────────────────────────────────────────────

const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((k: string) => store[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
  removeItem: vi.fn((k: string) => { delete store[k]; }),
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getSecureValue, removeSecureValue, setSecureValue } from './nativeStorage';

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  Object.keys(store).forEach((k) => delete store[k]);
});

describe('nativeStorage — web fallback (isNativePlatform = false)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(false); });

  it('setSecureValue writes to localStorage', async () => {
    await setSecureValue('token', 'abc');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', 'abc');
    expect(mocks.preferencesSet).not.toHaveBeenCalled();
  });

  it('getSecureValue reads from localStorage', async () => {
    store['token'] = 'abc';
    const result = await getSecureValue('token');
    expect(result).toBe('abc');
    expect(mocks.preferencesGet).not.toHaveBeenCalled();
  });

  it('getSecureValue returns null for missing key', async () => {
    const result = await getSecureValue('missing');
    expect(result).toBeNull();
  });

  it('removeSecureValue deletes from localStorage', async () => {
    store['token'] = 'abc';
    await removeSecureValue('token');
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
    expect(mocks.preferencesRemove).not.toHaveBeenCalled();
    expect(store['token']).toBeUndefined();
  });
});

describe('nativeStorage — native path (isNativePlatform = true)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(true); });

  it('setSecureValue calls Preferences.set with correct args', async () => {
    await setSecureValue('token', 'xyz');
    expect(mocks.preferencesSet).toHaveBeenCalledWith({ key: 'token', value: 'xyz' });
    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });

  it('getSecureValue calls Preferences.get and returns the value', async () => {
    mocks.preferencesGet.mockResolvedValueOnce({ value: 'xyz' });
    const result = await getSecureValue('token');
    expect(mocks.preferencesGet).toHaveBeenCalledWith({ key: 'token' });
    expect(result).toBe('xyz');
  });

  it('getSecureValue returns null when Preferences returns null', async () => {
    mocks.preferencesGet.mockResolvedValueOnce({ value: null });
    const result = await getSecureValue('token');
    expect(result).toBeNull();
  });

  it('removeSecureValue calls Preferences.remove with correct key', async () => {
    await removeSecureValue('token');
    expect(mocks.preferencesRemove).toHaveBeenCalledWith({ key: 'token' });
    expect(mockLocalStorage.removeItem).not.toHaveBeenCalled();
  });
});
