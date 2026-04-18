/**
 * nativePushNotifications.test.ts — tests for the push notification bridge.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => false),
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  register: vi.fn(async () => undefined),
  removeAllListeners: vi.fn(async () => undefined),
}));

vi.mock('./index', () => ({
  isNative: mocks.isNative,
}));

// Build a controllable plugin factory so each test gets fresh listener slots.
function makePluginMock(opts: {
  tokenValue?: string;
  errorMessage?: string;
  permissionResult?: string;
} = {}) {
  const { tokenValue, errorMessage, permissionResult = 'granted' } = opts;

  return {
    requestPermissions: async () => ({ receive: permissionResult }),
    register: mocks.register,
    removeAllListeners: mocks.removeAllListeners,
    addListener: async (event: string, handler: (arg: unknown) => void) => {
      // Fire the handler on the next microtask so the Promise chain settles
      if (event === 'registration' && tokenValue !== undefined) {
        Promise.resolve().then(() => handler({ value: tokenValue }));
      }
      if (event === 'registrationError' && errorMessage !== undefined) {
        Promise.resolve().then(() => handler({ error: errorMessage }));
      }
      return { remove: vi.fn() };
    },
  };
}

// Replace the dynamic import with a controllable factory
let pluginOverride: ReturnType<typeof makePluginMock> | null = null;

vi.mock('@capacitor/push-notifications', () => ({
  get PushNotifications() {
    return pluginOverride;
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => false },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  deregisterPushNotifications,
  registerForPushNotifications,
} from './nativePushNotifications';

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  pluginOverride = null;
});

describe('registerForPushNotifications — web unavailable', () => {
  beforeEach(() => { mocks.isNative.mockReturnValue(false); });

  it('returns unavailable on web without calling plugin', async () => {
    const result = await registerForPushNotifications();
    expect(result.status).toBe('unavailable');
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });
});

describe('registerForPushNotifications — native happy path', () => {
  beforeEach(() => { mocks.isNative.mockReturnValue(true); });

  it('returns registered with token and platform', async () => {
    pluginOverride = makePluginMock({ tokenValue: 'test-device-token-abc' });
    const result = await registerForPushNotifications();
    expect(result.status).toBe('registered');
    expect(result.token).toBe('test-device-token-abc');
    expect(result.platform).toBe('android');
  });

  it('calls register after permission is granted', async () => {
    pluginOverride = makePluginMock({ tokenValue: 'tok' });
    await registerForPushNotifications();
    expect(mocks.register).toHaveBeenCalledOnce();
  });
});

describe('registerForPushNotifications — permission denied', () => {
  beforeEach(() => { mocks.isNative.mockReturnValue(true); });

  it('returns permission-denied without calling register', async () => {
    pluginOverride = makePluginMock({ permissionResult: 'denied' });
    const result = await registerForPushNotifications();
    expect(result.status).toBe('permission-denied');
    expect(mocks.register).not.toHaveBeenCalled();
  });
});

describe('registerForPushNotifications — registration error', () => {
  beforeEach(() => { mocks.isNative.mockReturnValue(true); });

  it('returns unavailable on registration error', async () => {
    pluginOverride = makePluginMock({ errorMessage: 'FCM_ERROR' });
    const result = await registerForPushNotifications();
    expect(result.status).toBe('unavailable');
  });
});

describe('deregisterPushNotifications', () => {
  it('is a no-op on web', async () => {
    mocks.isNative.mockReturnValue(false);
    await deregisterPushNotifications();
    expect(mocks.removeAllListeners).not.toHaveBeenCalled();
  });

  it('calls removeAllListeners on native', async () => {
    mocks.isNative.mockReturnValue(true);
    pluginOverride = makePluginMock();
    await deregisterPushNotifications();
    expect(mocks.removeAllListeners).toHaveBeenCalledOnce();
  });
});
