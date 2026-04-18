/**
 * pushTokenHandlers.test.ts — tests for mobileAccess:registerPushToken handler.
 *
 * Covers: successful register, invalid args, unauthorized (unknown deviceId),
 * persistence into tokenStore, and raw token never logged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  listDevices: vi.fn(() => [] as Array<Record<string, unknown>>),
  addDevice: vi.fn(),
  ipcHandle: vi.fn(),
  ipcRemoveHandler: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../mobileAccess/tokenStore', () => ({
  listDevices: mocks.listDevices,
  addDevice: mocks.addDevice,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
    removeHandler: mocks.ipcRemoveHandler,
  },
}));

vi.mock('../logger', () => ({
  default: { info: mocks.logInfo, warn: mocks.logWarn, error: mocks.logError },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  cleanupPushTokenHandler,
  registerPushTokenHandler,
} from './pushTokenHandlers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_DEVICE = {
  id: 'dev-abc',
  label: 'Test Phone',
  refreshTokenHash: 'hash',
  fingerprint: 'fp',
  capabilities: ['paired-read', 'paired-write'],
  issuedAt: '2026-01-01T00:00:00Z',
  lastSeenAt: '2026-01-01T00:00:00Z',
};

/** Extracts the registered IPC handler function from the mock. */
function getCapturedHandler() {
  const call = mocks.ipcHandle.mock.calls.find(
    (c: unknown[]) => c[0] === 'mobileAccess:registerPushToken',
  );
  if (!call) throw new Error('handler not registered');
  return call[1] as (event: unknown, args: unknown) => Promise<unknown>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  cleanupPushTokenHandler();
  registerPushTokenHandler();
});

afterEach(() => {
  cleanupPushTokenHandler();
});

describe('registerPushTokenHandler — registration', () => {
  it('registers the IPC channel on first call', () => {
    expect(mocks.ipcHandle).toHaveBeenCalledWith(
      'mobileAccess:registerPushToken',
      expect.any(Function),
    );
  });

  it('does not double-register on second call', () => {
    registerPushTokenHandler(); // second call
    const calls = mocks.ipcHandle.mock.calls.filter(
      (c: unknown[]) => c[0] === 'mobileAccess:registerPushToken',
    );
    expect(calls.length).toBe(1);
  });
});

describe('handleRegisterPushToken — invalid args', () => {
  it('rejects null args', async () => {
    const handler = getCapturedHandler();
    const result = await handler(null, null);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('invalid') });
  });

  it('rejects missing token field', async () => {
    const handler = getCapturedHandler();
    const result = await handler(null, { deviceId: 'dev-abc', platform: 'android' });
    expect(result).toMatchObject({ success: false });
  });

  it('rejects invalid platform value', async () => {
    const handler = getCapturedHandler();
    const result = await handler(null, { deviceId: 'dev-abc', token: 'tok', platform: 'web' });
    expect(result).toMatchObject({ success: false });
  });
});

describe('handleRegisterPushToken — unauthorized', () => {
  it('returns unauthorized when deviceId is not in store', async () => {
    mocks.listDevices.mockReturnValue([]);
    const handler = getCapturedHandler();
    const result = await handler(null, {
      deviceId: 'unknown-device',
      token: 'tok',
      platform: 'android',
    });
    expect(result).toMatchObject({ success: false, error: 'unauthorized' });
    expect(mocks.addDevice).not.toHaveBeenCalled();
  });
});

describe('handleRegisterPushToken — happy path', () => {
  it('persists pushToken and pushPlatform for known device', async () => {
    mocks.listDevices.mockReturnValue([BASE_DEVICE]);
    const handler = getCapturedHandler();
    const result = await handler(null, {
      deviceId: 'dev-abc',
      token: 'fcm-token-xyz',
      platform: 'android',
    });
    expect(result).toMatchObject({ success: true });
    expect(mocks.addDevice).toHaveBeenCalledWith(
      expect.objectContaining({ pushToken: 'fcm-token-xyz', pushPlatform: 'android' }),
    );
  });

  it('works with ios platform', async () => {
    mocks.listDevices.mockReturnValue([BASE_DEVICE]);
    const handler = getCapturedHandler();
    const result = await handler(null, {
      deviceId: 'dev-abc',
      token: 'apns-token-abc',
      platform: 'ios',
    });
    expect(result).toMatchObject({ success: true });
    expect(mocks.addDevice).toHaveBeenCalledWith(
      expect.objectContaining({ pushPlatform: 'ios' }),
    );
  });

  it('never logs the raw token value', async () => {
    mocks.listDevices.mockReturnValue([BASE_DEVICE]);
    const handler = getCapturedHandler();
    const rawToken = 'super-secret-push-token-99999';
    await handler(null, { deviceId: 'dev-abc', token: rawToken, platform: 'android' });

    const allLogArgs = [
      ...mocks.logInfo.mock.calls,
      ...mocks.logWarn.mock.calls,
      ...mocks.logError.mock.calls,
    ].flat().join(' ');
    expect(allLogArgs).not.toContain(rawToken);
    expect(allLogArgs).toContain(rawToken.slice(0, 8));
  });
});
