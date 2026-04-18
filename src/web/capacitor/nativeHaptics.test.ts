/**
 * nativeHaptics.test.ts — tests for the haptic feedback bridge.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  selectionChanged: vi.fn(async () => undefined),
  impact: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    selectionChanged: mocks.selectionChanged,
    impact: mocks.impact,
  },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { hapticImpact, hapticSelection } from './nativeHaptics';

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => { vi.clearAllMocks(); });

describe('nativeHaptics — web fallback (isNativePlatform = false)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(false); });

  it('hapticSelection is a no-op on web', async () => {
    await hapticSelection();
    expect(mocks.selectionChanged).not.toHaveBeenCalled();
  });

  it('hapticImpact is a no-op on web', async () => {
    await hapticImpact('heavy');
    expect(mocks.impact).not.toHaveBeenCalled();
  });
});

describe('nativeHaptics — native path (isNativePlatform = true)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(true); });

  it('hapticSelection calls Haptics.selectionChanged()', async () => {
    await hapticSelection();
    expect(mocks.selectionChanged).toHaveBeenCalledOnce();
  });

  it('hapticImpact defaults to medium style', async () => {
    await hapticImpact();
    expect(mocks.impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
  });

  it('hapticImpact passes light style correctly', async () => {
    await hapticImpact('light');
    expect(mocks.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
  });

  it('hapticImpact passes heavy style correctly', async () => {
    await hapticImpact('heavy');
    expect(mocks.impact).toHaveBeenCalledWith({ style: 'HEAVY' });
  });
});
