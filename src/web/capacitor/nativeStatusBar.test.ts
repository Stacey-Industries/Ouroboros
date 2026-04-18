/**
 * nativeStatusBar.test.ts — tests for the status bar theming bridge.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  setStyle: vi.fn(async () => undefined),
  setBackgroundColor: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: mocks.setStyle,
    setBackgroundColor: mocks.setBackgroundColor,
  },
  Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { setStatusBarColor, setStatusBarStyle } from './nativeStatusBar';

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => { vi.clearAllMocks(); });

describe('nativeStatusBar — web fallback (isNativePlatform = false)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(false); });

  it('setStatusBarStyle is a no-op on web', async () => {
    await setStatusBarStyle('dark');
    expect(mocks.setStyle).not.toHaveBeenCalled();
  });

  it('setStatusBarColor is a no-op on web', async () => {
    await setStatusBarColor('#1a1a2e');
    expect(mocks.setBackgroundColor).not.toHaveBeenCalled();
  });
});

describe('nativeStatusBar — native path (isNativePlatform = true)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(true); });

  it('setStatusBarStyle(dark) calls StatusBar.setStyle with DARK', async () => {
    await setStatusBarStyle('dark');
    expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
  });

  it('setStatusBarStyle(light) calls StatusBar.setStyle with LIGHT', async () => {
    await setStatusBarStyle('light');
    expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
  });

  it('setStatusBarColor calls setBackgroundColor with the hex value', async () => {
    await setStatusBarColor('#1a1a2e');
    expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#1a1a2e' });
  });

  it('setStatusBarColor passes hex value unchanged to the plugin', async () => {
    await setStatusBarColor('#ffffff');
    expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#ffffff' });
  });
});
