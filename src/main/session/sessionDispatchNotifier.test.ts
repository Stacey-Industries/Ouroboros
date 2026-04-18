/**
 * sessionDispatchNotifier.test.ts — tests for the dispatch job notifier.
 *
 * Covers:
 *   - No-op on non-terminal status
 *   - In-app banner path (no pushToken / no FCM config)
 *   - FCM path (pushToken + serviceAccountPath configured) → sent:true skips banner
 *   - FCM stub returns sent:false → falls back to banner
 *   - No deviceId → broadcast banner to all windows
 *   - Unknown deviceId → silently bail
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PairedDevice } from '../mobileAccess/types';
import type { FcmResult } from './fcmAdapter';
import type { DispatchJob } from './sessionDispatch';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  listDevices: vi.fn((): PairedDevice[] => []),
  getConfigValue: vi.fn((): unknown => undefined),
  sendFcm: vi.fn(async (): Promise<FcmResult> => ({ sent: false, reason: 'no-fcm-backend' })),
  webContentsSend: vi.fn(),
  getAllWindows: vi.fn((): Array<{ isDestroyed(): boolean; webContents: { send: ReturnType<typeof vi.fn> } }> => []),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('../mobileAccess/tokenStore', () => ({ listDevices: mocks.listDevices }));
vi.mock('../config', () => ({ getConfigValue: mocks.getConfigValue }));
vi.mock('./fcmAdapter', () => ({ sendFcmNotification: mocks.sendFcm }));
vi.mock('../logger', () => ({
  default: { info: mocks.logInfo, warn: mocks.logWarn, error: vi.fn() },
}));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: mocks.getAllWindows },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { notifyJobTransition } from './sessionDispatchNotifier';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWindow() {
  return { isDestroyed: (): boolean => false, webContents: { send: mocks.webContentsSend } };
}

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: 'job-1',
    request: { title: 'My Task', prompt: 'do stuff', projectPath: '/proj' },
    status: 'completed',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDevice(extra: Partial<PairedDevice> = {}): PairedDevice {
  return {
    id: 'dev-1',
    label: 'iPhone',
    refreshTokenHash: 'h',
    fingerprint: 'f',
    capabilities: [],
    issuedAt: '',
    lastSeenAt: '',
    ...extra,
  };
}

afterEach(() => { vi.clearAllMocks(); });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('notifyJobTransition — non-terminal statuses', () => {
  const nonTerminal = ['queued', 'starting', 'running', 'canceled'] as const;

  for (const status of nonTerminal) {
    it(`ignores status="${status}"`, async () => {
      await notifyJobTransition(makeJob({ status }));
      expect(mocks.webContentsSend).not.toHaveBeenCalled();
      expect(mocks.sendFcm).not.toHaveBeenCalled();
    });
  }
});

describe('notifyJobTransition — no deviceId', () => {
  it('broadcasts in-app banner to all windows', async () => {
    mocks.getAllWindows.mockReturnValue([makeWindow()]);
    await notifyJobTransition(makeJob({ deviceId: undefined }));
    expect(mocks.webContentsSend).toHaveBeenCalledWith(
      'sessionDispatch:notification',
      expect.objectContaining({ jobId: 'job-1', status: 'completed' }),
    );
  });
});

describe('notifyJobTransition — deviceId not found', () => {
  it('bails silently when device is not in store', async () => {
    mocks.listDevices.mockReturnValue([]);
    mocks.getAllWindows.mockReturnValue([makeWindow()]);
    await notifyJobTransition(makeJob({ deviceId: 'unknown-device' }));
    expect(mocks.webContentsSend).not.toHaveBeenCalled();
    expect(mocks.sendFcm).not.toHaveBeenCalled();
  });
});

describe('notifyJobTransition — banner path (no pushToken)', () => {
  it('sends in-app banner when device has no pushToken', async () => {
    mocks.listDevices.mockReturnValue([makeDevice({ id: 'dev-1' })]);
    mocks.getAllWindows.mockReturnValue([makeWindow()]);
    await notifyJobTransition(makeJob({ deviceId: 'dev-1' }));
    expect(mocks.sendFcm).not.toHaveBeenCalled();
    expect(mocks.webContentsSend).toHaveBeenCalledWith(
      'sessionDispatch:notification',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });
});

describe('notifyJobTransition — FCM path', () => {
  const device = makeDevice({
    id: 'dev-2',
    pushToken: 'fcm-device-token',
    pushPlatform: 'android',
  });

  it('calls FCM and skips banner when FCM returns sent:true', async () => {
    mocks.listDevices.mockReturnValue([device]);
    mocks.getConfigValue.mockReturnValue({ fcmServiceAccountPath: '/sa.json' });
    mocks.sendFcm.mockResolvedValue({ sent: true });
    mocks.getAllWindows.mockReturnValue([makeWindow()]);

    await notifyJobTransition(makeJob({ deviceId: 'dev-2' }));

    expect(mocks.sendFcm).toHaveBeenCalledWith(
      '/sa.json',
      'fcm-device-token',
      expect.objectContaining({ title: expect.any(String), body: expect.any(String) }),
    );
    expect(mocks.webContentsSend).not.toHaveBeenCalled();
  });

  it('falls back to banner when FCM stub returns sent:false', async () => {
    mocks.listDevices.mockReturnValue([device]);
    mocks.getConfigValue.mockReturnValue({ fcmServiceAccountPath: '/sa.json' });
    mocks.sendFcm.mockResolvedValue({ sent: false, reason: 'no-fcm-backend' });
    mocks.getAllWindows.mockReturnValue([makeWindow()]);

    await notifyJobTransition(makeJob({ deviceId: 'dev-2' }));

    expect(mocks.webContentsSend).toHaveBeenCalledWith(
      'sessionDispatch:notification',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('falls back to banner when FCM throws', async () => {
    mocks.listDevices.mockReturnValue([device]);
    mocks.getConfigValue.mockReturnValue({ fcmServiceAccountPath: '/sa.json' });
    mocks.sendFcm.mockRejectedValue(new Error('network error'));
    mocks.getAllWindows.mockReturnValue([makeWindow()]);

    await notifyJobTransition(makeJob({ deviceId: 'dev-2' }));

    expect(mocks.webContentsSend).toHaveBeenCalledWith(
      'sessionDispatch:notification',
      expect.objectContaining({ status: 'completed' }),
    );
  });
});

describe('notifyJobTransition — failed job payload', () => {
  it('includes error text in banner body', async () => {
    mocks.getAllWindows.mockReturnValue([makeWindow()]);
    await notifyJobTransition(
      makeJob({ status: 'failed', error: 'timeout', deviceId: undefined }),
    );
    const payload = mocks.webContentsSend.mock.calls[0]?.[1] as {
      body: string; status: string;
    };
    expect(payload.body).toContain('timeout');
    expect(payload.status).toBe('failed');
  });
});
