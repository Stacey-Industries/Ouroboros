/**
 * @vitest-environment jsdom
 *
 * usePushRegistration.test.ts — tests for the push registration hook.
 *
 * Covers: native registered path, permission-denied, unavailable (web),
 * no-op when not paired, no-op when deviceId absent, runs once per deviceId.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  registerForPush: vi.fn(async () => ({ status: 'unavailable' as const })),
  registerPushToken: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../web/capacitor/nativePushNotifications', () => ({
  registerForPushNotifications: mocks.registerForPush,
}));

// Provide a minimal window.electronAPI stub
const electronAPIMock = {
  mobileAccess: {
    registerPushToken: mocks.registerPushToken,
  },
};

// ─── Import after mocks ───────────────────────────────────────────────────────

import { usePushRegistration } from './usePushRegistration';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'window', {
    value: { electronAPI: electronAPIMock },
    writable: true,
    configurable: true,
  });
});

afterEach(() => { vi.clearAllMocks(); });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('usePushRegistration — not paired / no deviceId', () => {
  it('does not call registerForPushNotifications when isPaired=false', async () => {
    renderHook(() => usePushRegistration({ deviceId: 'dev-1', isPaired: false }));
    // Allow microtask queue to settle
    await Promise.resolve();
    expect(mocks.registerForPush).not.toHaveBeenCalled();
  });

  it('does not call registerForPushNotifications when deviceId is undefined', async () => {
    renderHook(() => usePushRegistration({ deviceId: undefined, isPaired: true }));
    await Promise.resolve();
    expect(mocks.registerForPush).not.toHaveBeenCalled();
  });
});

describe('usePushRegistration — web / unavailable platform', () => {
  it('calls bridge but does not invoke IPC when status is unavailable', async () => {
    mocks.registerForPush.mockResolvedValue({ status: 'unavailable' });

    const { unmount } = renderHook(() =>
      usePushRegistration({ deviceId: 'dev-1', isPaired: true }),
    );

    await vi.waitFor(() => expect(mocks.registerForPush).toHaveBeenCalledOnce());
    expect(mocks.registerPushToken).not.toHaveBeenCalled();
    unmount();
  });
});

describe('usePushRegistration — permission denied', () => {
  it('does not invoke IPC when permission is denied', async () => {
    mocks.registerForPush.mockResolvedValue({ status: 'permission-denied' });

    renderHook(() => usePushRegistration({ deviceId: 'dev-1', isPaired: true }));

    await vi.waitFor(() => expect(mocks.registerForPush).toHaveBeenCalledOnce());
    expect(mocks.registerPushToken).not.toHaveBeenCalled();
  });
});

describe('usePushRegistration — native registered', () => {
  it('calls registerPushToken IPC with token and platform', async () => {
    mocks.registerForPush.mockResolvedValue({
      status: 'registered',
      token: 'native-token-abc',
      platform: 'android',
    });

    renderHook(() => usePushRegistration({ deviceId: 'dev-42', isPaired: true }));

    await vi.waitFor(() => expect(mocks.registerPushToken).toHaveBeenCalledOnce());
    expect(mocks.registerPushToken).toHaveBeenCalledWith({
      deviceId: 'dev-42',
      token: 'native-token-abc',
      platform: 'android',
    });
  });

  it('only registers once even if hook re-renders', async () => {
    mocks.registerForPush.mockResolvedValue({
      status: 'registered',
      token: 'tok',
      platform: 'ios',
    });

    const { rerender } = renderHook(
      (props: { deviceId: string; isPaired: boolean }) => usePushRegistration(props),
      { initialProps: { deviceId: 'dev-7', isPaired: true } },
    );

    await vi.waitFor(() => expect(mocks.registerForPush).toHaveBeenCalledOnce());

    rerender({ deviceId: 'dev-7', isPaired: true });
    rerender({ deviceId: 'dev-7', isPaired: true });

    expect(mocks.registerForPush).toHaveBeenCalledOnce();
    expect(mocks.registerPushToken).toHaveBeenCalledOnce();
  });
});

describe('usePushRegistration — error resilience', () => {
  it('does not throw when bridge rejects', async () => {
    mocks.registerForPush.mockRejectedValue(new Error('native crash'));

    expect(() =>
      renderHook(() => usePushRegistration({ deviceId: 'dev-1', isPaired: true })),
    ).not.toThrow();

    // Allow the async effect to settle
    await new Promise((r) => setTimeout(r, 10));
  });
});
