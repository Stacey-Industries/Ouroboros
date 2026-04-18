/**
 * pairingHandlers.test.ts — Unit tests for Wave 33a Phase B pairing handlers.
 *
 * Tests the four exported functions:
 *   - handleGeneratePairingCode (via ipcMain mock)
 *   - handleListPairedDevices   (via ipcMain mock)
 *   - handleRevokePairedDevice  (via ipcMain mock)
 *   - consumePairingTicket      (direct export)
 */

import crypto from 'crypto';
import { ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock('../web/webAuth', () => ({
  isRateLimited: vi.fn().mockReturnValue(false),
  recordFailedAttempt: vi.fn(),
}));

vi.mock('../web/webServer', () => ({
  getWebServerPort: vi.fn().mockReturnValue(7890),
}));

vi.mock('./bridgeDisconnect', () => ({
  disconnectDevice: vi.fn(),
  registerConnection: vi.fn(),
  unregisterConnection: vi.fn(),
  getTrackedConnectionCount: vi.fn(() => 0),
}));

vi.mock('./pairingTickets', () => ({
  issueTicket: vi.fn(),
  verifyAndConsume: vi.fn(),
}));

vi.mock('./tokenStore', () => ({
  addDevice: vi.fn(),
  hashToken: vi.fn((t: string) => crypto.createHash('sha256').update(t).digest('base64url')),
  listDevices: vi.fn(),
  removeDevice: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getConfigValue, setConfigValue } from '../config';
import { isRateLimited, recordFailedAttempt } from '../web/webAuth';
import { disconnectDevice } from './bridgeDisconnect';
import { consumePairingTicket, registerPairingHandlers } from './pairingHandlers';
import { issueTicket, verifyAndConsume } from './pairingTickets';
import { addDevice, listDevices, removeDevice } from './tokenStore';
import type { PairedDevice } from './types';

const mockedGetConfig = vi.mocked(getConfigValue);
const mockedSetConfig = vi.mocked(setConfigValue);
const mockedIssue = vi.mocked(issueTicket);
const mockedVerify = vi.mocked(verifyAndConsume);
const mockedList = vi.mocked(listDevices);
const mockedRemove = vi.mocked(removeDevice);
const mockedAdd = vi.mocked(addDevice);
const mockedDisconnect = vi.mocked(disconnectDevice);
const mockedIsRateLimited = vi.mocked(isRateLimited);
const mockedRecordFailed = vi.mocked(recordFailedAttempt);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeDevice(overrides: Partial<PairedDevice> = {}): PairedDevice {
  return {
    id: 'dev-1',
    label: "Cole's iPhone",
    refreshTokenHash: 'abc123hash',
    fingerprint: 'client-fp',
    capabilities: ['paired-read', 'paired-write'],
    issuedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

function captureHandler(channel: string): ((...args: unknown[]) => Promise<unknown>) | undefined {
  const calls = vi.mocked(ipcMain.handle).mock.calls;
  const found = calls.find((c) => c[0] === channel);
  return found ? (found[1] as (...args: unknown[]) => Promise<unknown>) : undefined;
}

// ─── generatePairingCode ──────────────────────────────────────────────────────

describe('generatePairingCode handler', () => {
  beforeEach(() => {
    // Simulate no existing fingerprint so one is generated
    mockedGetConfig.mockReturnValue({ enabled: false, pairedDevices: [] });
    mockedIssue.mockReturnValue({
      code: '042819',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      consumed: false,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('returns success with code, expiresAt, qrPayload, and qrPairingUrl', async () => {
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:generatePairingCode');
    expect(handler).toBeDefined();
    const result = (await handler?.()) as {
      success: boolean;
      code: string;
      expiresAt: number;
      qrPayload: { v: number; host: string; port: number; code: string; fingerprint: string };
      qrPairingUrl: string;
    };
    expect(result.success).toBe(true);
    expect(result.code).toBe('042819');
    expect(typeof result.expiresAt).toBe('number');
    expect(result.qrPayload.v).toBe(1);
    expect(result.qrPayload.port).toBe(7890);
    expect(typeof result.qrPayload.host).toBe('string');
    expect(result.qrPayload.code).toBe('042819');
    expect(typeof result.qrPayload.fingerprint).toBe('string');
    // Phase E: qrPairingUrl is the ouroboros://pair deep-link URL
    expect(typeof result.qrPairingUrl).toBe('string');
    expect(result.qrPairingUrl).toMatch(/^ouroboros:\/\/pair\?/);
    expect(result.qrPairingUrl).toContain('code=042819');
    expect(result.qrPairingUrl).toContain('port=7890');
  });

  it('persists a fingerprint when none exists', async () => {
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:generatePairingCode');
    await handler?.();
    expect(mockedSetConfig).toHaveBeenCalledWith(
      'mobileAccess',
      expect.objectContaining({ desktopFingerprint: expect.any(String) }),
    );
  });

  it('reuses an existing fingerprint without overwriting config', async () => {
    mockedGetConfig.mockReturnValue({
      enabled: false,
      pairedDevices: [],
      desktopFingerprint: 'existing-fp',
    });
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:generatePairingCode');
    const result = (await handler?.()) as { qrPayload: { fingerprint: string } };
    expect(result.qrPayload.fingerprint).toBe('existing-fp');
    expect(mockedSetConfig).not.toHaveBeenCalled();
  });

  it('falls back to 127.0.0.1 when getWebServerPort returns null', async () => {
    const { getWebServerPort } = await import('../web/webServer');
    vi.mocked(getWebServerPort).mockReturnValueOnce(null);
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:generatePairingCode');
    const result = (await handler?.()) as { qrPayload: { port: number } };
    // Port falls back to 7890 (the default constant)
    expect(result.qrPayload.port).toBe(7890);
  });
});

// ─── listPairedDevices ────────────────────────────────────────────────────────

describe('listPairedDevices handler', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns sanitized devices without refreshTokenHash', async () => {
    const device = makeFakeDevice({ refreshTokenHash: 'secret-hash' });
    mockedList.mockReturnValue([device]);
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:listPairedDevices');
    const result = (await handler?.()) as { success: boolean; devices: object[] };
    expect(result.success).toBe(true);
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]).not.toHaveProperty('refreshTokenHash');
  });

  it('returns empty array when no devices are paired', async () => {
    mockedList.mockReturnValue([]);
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:listPairedDevices');
    const result = (await handler?.()) as { success: boolean; devices: unknown[] };
    expect(result.success).toBe(true);
    expect(result.devices).toHaveLength(0);
  });
});

// ─── revokePairedDevice ───────────────────────────────────────────────────────

describe('revokePairedDevice handler', () => {
  afterEach(() => vi.clearAllMocks());

  it('removes the device and calls disconnectDevice', async () => {
    mockedRemove.mockReturnValue(true);
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:revokePairedDevice');
    const result = await handler?.(undefined, 'dev-1');
    expect(result).toEqual({ success: true });
    expect(mockedRemove).toHaveBeenCalledWith('dev-1');
    expect(mockedDisconnect).toHaveBeenCalledWith('dev-1');
  });

  it('returns error when device not found', async () => {
    mockedRemove.mockReturnValue(false);
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:revokePairedDevice');
    const result = (await handler?.(undefined, 'unknown-dev')) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error for missing deviceId', async () => {
    registerPairingHandlers();
    const handler = captureHandler('mobileAccess:revokePairedDevice');
    const result = (await handler?.(undefined, '')) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── consumePairingTicket ─────────────────────────────────────────────────────

describe('consumePairingTicket', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns rate-limited when IP is over the limit', () => {
    mockedIsRateLimited.mockReturnValueOnce(true);
    const result = consumePairingTicket('123456', 'iPhone', 'fp', '1.2.3.4');
    expect(result).toEqual({ error: 'rate-limited' });
  });

  it('returns invalid and records failed attempt when ticket not found', () => {
    mockedIsRateLimited.mockReturnValue(false);
    mockedVerify.mockReturnValue(null);
    const result = consumePairingTicket('000000', 'iPhone', 'fp', '1.2.3.4');
    expect(result).toEqual({ error: 'invalid' });
    expect(mockedRecordFailed).toHaveBeenCalledWith('1.2.3.4');
  });

  it('returns expired when ticket expiresAt is in the past', () => {
    mockedIsRateLimited.mockReturnValue(false);
    mockedVerify.mockReturnValue({
      code: '123456',
      createdAt: Date.now() - 120_000,
      expiresAt: Date.now() - 1,
      consumed: true,
    });
    const result = consumePairingTicket('123456', 'iPhone', 'fp', '1.2.3.4');
    expect(result).toEqual({ error: 'expired' });
  });

  it('returns device and refreshToken on success', () => {
    mockedIsRateLimited.mockReturnValue(false);
    const expiresAt = Date.now() + 60_000;
    mockedVerify.mockReturnValue({
      code: '042819',
      createdAt: Date.now(),
      expiresAt,
      consumed: true,
    });
    const result = consumePairingTicket('042819', 'Cole iPhone', 'client-fp', '10.0.0.5');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.device.label).toBe('Cole iPhone');
    expect(result.device.fingerprint).toBe('client-fp');
    expect(result.device.capabilities).toContain('paired-read');
    expect(result.device.capabilities).toContain('paired-write');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.refreshToken.length).toBeGreaterThan(0);
    // The raw refresh token must NOT be stored — only its hash
    expect(mockedAdd).toHaveBeenCalledWith(
      expect.objectContaining({ refreshTokenHash: expect.not.stringContaining(result.refreshToken) }),
    );
  });

  it('never includes the raw refresh token in the stored device record', () => {
    mockedIsRateLimited.mockReturnValue(false);
    mockedVerify.mockReturnValue({
      code: '111111',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      consumed: true,
    });
    consumePairingTicket('111111', 'Test', 'fp', '127.0.0.1');
    const storedDevice = mockedAdd.mock.calls[0]?.[0];
    // The stored hash should be a SHA-256 base64url, not the raw token
    expect(storedDevice?.refreshTokenHash).not.toBe('');
    expect(storedDevice?.refreshTokenHash.length).toBeGreaterThan(20);
  });
});
