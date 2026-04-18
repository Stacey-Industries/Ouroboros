/**
 * nativeShare.test.ts — tests for the native share sheet bridge.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  shareShare: vi.fn(async () => ({ activityType: '' })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: mocks.shareShare },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { nativeShare } from './nativeShare';

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => { vi.clearAllMocks(); });

describe('nativeShare — native path (isNativePlatform = true)', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReturnValue(true); });

  it('calls Share.share with the provided options and returns true', async () => {
    const opts = { title: 'Test', text: 'hello', url: 'https://example.com' };
    const result = await nativeShare(opts);
    expect(mocks.shareShare).toHaveBeenCalledWith(opts);
    expect(result).toBe(true);
  });

  it('passes dialogTitle through to Share.share', async () => {
    const opts = { url: 'https://x.com', dialogTitle: 'Share via' };
    await nativeShare(opts);
    expect(mocks.shareShare).toHaveBeenCalledWith(opts);
  });
});

describe('nativeShare — web, navigator.share available', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(false);
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: vi.fn(async () => undefined) },
      writable: true,
      configurable: true,
    });
  });

  it('delegates to navigator.share and returns true on success', async () => {
    const result = await nativeShare({ title: 'T', text: 'hi', url: 'https://x.com' });
    expect(result).toBe(true);
    expect(mocks.shareShare).not.toHaveBeenCalled();
  });

  it('returns false when navigator.share throws (e.g. user cancels)', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: vi.fn(async () => { throw new Error('AbortError'); }) },
      writable: true,
      configurable: true,
    });
    const result = await nativeShare({ text: 'hi' });
    expect(result).toBe(false);
  });
});

describe('nativeShare — web, no navigator.share, clipboard available', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(false);
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: undefined,
        clipboard: { writeText: vi.fn(async () => undefined) },
      },
      writable: true,
      configurable: true,
    });
  });

  it('copies url to clipboard and returns true', async () => {
    const result = await nativeShare({ url: 'https://example.com' });
    expect(result).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('copies text when url is absent', async () => {
    const result = await nativeShare({ text: 'some text' });
    expect(result).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith('some text');
  });

  it('returns false when options carry no copyable content', async () => {
    const result = await nativeShare({ title: 'Only title' });
    expect(result).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((navigator as any).clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe('nativeShare — web, no navigator.share, clipboard throws', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(false);
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: undefined,
        clipboard: { writeText: vi.fn(async () => { throw new Error('NotAllowed'); }) },
      },
      writable: true,
      configurable: true,
    });
  });

  it('returns false when clipboard write fails', async () => {
    const result = await nativeShare({ url: 'https://example.com' });
    expect(result).toBe(false);
  });
});
