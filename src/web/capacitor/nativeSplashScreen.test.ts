/**
 * nativeSplashScreen.test.ts
 *
 * Smoke tests for the nativeSplashScreen bridge.
 * Verifies that hideSplashScreen() delegates to @capacitor/splash-screen on
 * native and is a no-op on web.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockHide = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: mockHide },
}));

const mockIsNativePlatform = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mockIsNativePlatform },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('hideSplashScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls SplashScreen.hide() on native', async () => {
    mockIsNativePlatform.mockReturnValue(true);
    const { hideSplashScreen } = await import('./nativeSplashScreen');
    await hideSplashScreen();
    expect(mockHide).toHaveBeenCalledOnce();
  });

  it('is a no-op on web (SplashScreen.hide not called)', async () => {
    mockIsNativePlatform.mockReturnValue(false);
    const { hideSplashScreen } = await import('./nativeSplashScreen');
    await hideSplashScreen();
    expect(mockHide).not.toHaveBeenCalled();
  });
});
