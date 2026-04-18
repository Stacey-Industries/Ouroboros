/**
 * tokenStore.test.ts — Unit tests for mobileAccess token store.
 *
 * Mocks electron-store config the same way webAuth.test.ts does.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PairedDevice } from './types';

// ─── Mock config ─────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();

vi.mock('../config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

// Import after mocks are declared
const { addDevice, findByTokenHash, hashToken, listDevices, removeDevice, updateLastSeen } =
  await import('./tokenStore');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDevice(overrides: Partial<PairedDevice> = {}): PairedDevice {
  return {
    id: 'device-uuid-1',
    label: "Cole's iPhone 14",
    refreshTokenHash: hashToken('raw-token-abc'),
    fingerprint: 'fp-sha256-value',
    capabilities: ['paired-read'],
    issuedAt: '2026-04-17T00:00:00.000Z',
    lastSeenAt: '2026-04-17T00:00:00.000Z',
    ...overrides,
  };
}

function setupStore(devices: PairedDevice[] = []): void {
  mockGetConfigValue.mockReturnValue({ enabled: false, pairedDevices: devices });
  mockSetConfigValue.mockClear();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('listDevices', () => {
  it('returns empty array when no devices are stored', () => {
    mockGetConfigValue.mockReturnValue({ enabled: false, pairedDevices: [] });
    expect(listDevices()).toEqual([]);
  });

  it('returns empty array when mobileAccess config is missing', () => {
    mockGetConfigValue.mockReturnValue(undefined);
    expect(listDevices()).toEqual([]);
  });

  it('returns the stored devices array', () => {
    const device = makeDevice();
    mockGetConfigValue.mockReturnValue({ enabled: false, pairedDevices: [device] });
    expect(listDevices()).toEqual([device]);
  });
});

describe('addDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists a new device to config', () => {
    setupStore([]);
    const device = makeDevice();
    addDevice(device);
    expect(mockSetConfigValue).toHaveBeenCalledWith('mobileAccess', {
      enabled: false,
      pairedDevices: [device],
    });
  });

  it('replaces an existing device with the same id', () => {
    const original = makeDevice({ label: 'Old Label' });
    setupStore([original]);
    const updated = makeDevice({ label: 'New Label' });
    addDevice(updated);
    const [, written] = mockSetConfigValue.mock.calls[0] as [string, { pairedDevices: PairedDevice[] }];
    expect(written.pairedDevices).toHaveLength(1);
    expect(written.pairedDevices[0].label).toBe('New Label');
  });

  it('appends a second device with a different id', () => {
    const first = makeDevice({ id: 'device-1' });
    setupStore([first]);
    const second = makeDevice({ id: 'device-2', label: 'iPad' });
    addDevice(second);
    const [, written] = mockSetConfigValue.mock.calls[0] as [string, { pairedDevices: PairedDevice[] }];
    expect(written.pairedDevices).toHaveLength(2);
  });
});

describe('removeDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false and does not write when device is not found', () => {
    setupStore([]);
    const result = removeDevice('nonexistent-id');
    expect(result).toBe(false);
    expect(mockSetConfigValue).not.toHaveBeenCalled();
  });

  it('removes the device and returns true', () => {
    const device = makeDevice({ id: 'remove-me' });
    setupStore([device]);
    const result = removeDevice('remove-me');
    expect(result).toBe(true);
    const [, written] = mockSetConfigValue.mock.calls[0] as [string, { pairedDevices: PairedDevice[] }];
    expect(written.pairedDevices).toHaveLength(0);
  });

  it('only removes the matching device, leaving others intact', () => {
    const keep = makeDevice({ id: 'keeper' });
    const remove = makeDevice({ id: 'goner' });
    setupStore([keep, remove]);
    removeDevice('goner');
    const [, written] = mockSetConfigValue.mock.calls[0] as [string, { pairedDevices: PairedDevice[] }];
    expect(written.pairedDevices).toHaveLength(1);
    expect(written.pairedDevices[0].id).toBe('keeper');
  });
});

describe('findByTokenHash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the device whose hash matches the provided raw token', () => {
    const rawToken = 'super-secret-refresh-token';
    const device = makeDevice({ refreshTokenHash: hashToken(rawToken) });
    setupStore([device]);
    const found = findByTokenHash(rawToken);
    expect(found).toEqual(device);
  });

  it('returns undefined when no device matches', () => {
    const device = makeDevice({ refreshTokenHash: hashToken('correct-token') });
    setupStore([device]);
    expect(findByTokenHash('wrong-token')).toBeUndefined();
  });

  it('returns undefined when store is empty', () => {
    setupStore([]);
    expect(findByTokenHash('any-token')).toBeUndefined();
  });
});

describe('updateLastSeen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates lastSeenAt for the matching device', () => {
    const device = makeDevice({ id: 'update-me', lastSeenAt: '2020-01-01T00:00:00.000Z' });
    setupStore([device]);
    const before = Date.now();
    updateLastSeen('update-me');
    expect(mockSetConfigValue).toHaveBeenCalledOnce();
    const [, written] = mockSetConfigValue.mock.calls[0] as [string, { pairedDevices: PairedDevice[] }];
    const updated = written.pairedDevices.find((d) => d.id === 'update-me');
    expect(updated).toBeDefined();
    const updatedTs = new Date(updated!.lastSeenAt).getTime();
    expect(updatedTs).toBeGreaterThanOrEqual(before);
  });

  it('does nothing when device id is not found', () => {
    setupStore([makeDevice({ id: 'existing' })]);
    updateLastSeen('nonexistent');
    expect(mockSetConfigValue).not.toHaveBeenCalled();
  });
});

describe('hashToken', () => {
  it('is deterministic — same input always yields same output', () => {
    const token = 'some-stable-token';
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('output is base64url — no +, /, or = characters', () => {
    // Run over 20 random-ish tokens to reduce false-negative probability
    for (let i = 0; i < 20; i++) {
      const hash = hashToken(`token-${i}-${'x'.repeat(i)}`);
      expect(hash).not.toMatch(/[+/=]/);
    }
  });

  it('output is a 43-character base64url string (256-bit SHA-256)', () => {
    // SHA-256 → 32 bytes → base64url without padding = ceil(32*4/3) = 43 chars
    expect(hashToken('any-token')).toHaveLength(43);
  });
});
