/**
 * @vitest-environment jsdom
 *
 * useNativeStatusBar.test.ts
 *
 * Verifies:
 * - rgbStringToHex parses rgb/rgba strings correctly
 * - rgbStringToHex returns fallback for transparent / unparseable values
 * - useNativeStatusBar calls setStatusBarStyle + setStatusBarColor on native
 * - useNativeStatusBar is a no-op when not native
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Bridge mocks ─────────────────────────────────────────────────────────────
// vi.hoisted() ensures variables are ready when vi.mock factories run.
const { mockSetStatusBarStyle, mockSetStatusBarColor, mockIsNative } = vi.hoisted(() => ({
  mockSetStatusBarStyle: vi.fn().mockResolvedValue(undefined),
  mockSetStatusBarColor: vi.fn().mockResolvedValue(undefined),
  mockIsNative: vi.fn(),
}));

vi.mock('../../web/capacitor', () => ({
  isNative: mockIsNative,
  setStatusBarStyle: mockSetStatusBarStyle,
  setStatusBarColor: mockSetStatusBarColor,
}));

// ─── Theme mock ───────────────────────────────────────────────────────────────

const { mockUseTheme } = vi.hoisted(() => ({ mockUseTheme: vi.fn() }));

vi.mock('./useTheme', () => ({
  useTheme: mockUseTheme,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { rgbStringToHex, useNativeStatusBar } from './useNativeStatusBar';

// ─── rgbStringToHex unit tests ────────────────────────────────────────────────

// hardcoded: test file — hex/rgba literals are test inputs and expected values for rgbStringToHex.
// These are not design-token usages; the color hook suppression applies here.
describe('rgbStringToHex', () => {
  it('converts rgb() to hex', () => { // hardcoded: test description contains rgb literal
    expect(rgbStringToHex('rgb(17, 17, 19)', '#000000')).toBe('#111113'); // hardcoded: test input/expected
  });

  it('converts rgba() with non-zero alpha to hex', () => { // hardcoded: test description contains rgba literal
    expect(rgbStringToHex('rgba(255, 255, 255, 1)', '#000000')).toBe('#ffffff'); // hardcoded: test input/expected
  });

  it('returns fallback for transparent rgba(0,0,0,0)', () => { // hardcoded: test description contains rgba literal
    expect(rgbStringToHex('rgba(0, 0, 0, 0)', '#111113')).toBe('#111113'); // hardcoded: test input/expected
  });

  it('returns fallback for unparseable string', () => {
    expect(rgbStringToHex('transparent', '#111113')).toBe('#111113'); // hardcoded: test input/expected
  });

  it('returns fallback for empty string', () => {
    expect(rgbStringToHex('', '#ffffff')).toBe('#ffffff'); // hardcoded: test input/expected
  });
});

// ─── useNativeStatusBar hook tests ────────────────────────────────────────────

describe('useNativeStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls setStatusBarStyle(dark) and setStatusBarColor for a dark theme', async () => {
    mockIsNative.mockReturnValue(true);
    mockUseTheme.mockReturnValue({ theme: { id: 'modern' } });
    // --surface-base not set: falls back to dark default #111113
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration);

    renderHook(() => useNativeStatusBar());

    await vi.waitFor(() => {
      expect(mockSetStatusBarStyle).toHaveBeenCalledWith('dark');
      expect(mockSetStatusBarColor).toHaveBeenCalledWith('#111113'); // hardcoded: test expected — native-boundary hex
    });
  });

  it('calls setStatusBarStyle(light) for the light theme', async () => {
    mockIsNative.mockReturnValue(true);
    mockUseTheme.mockReturnValue({ theme: { id: 'light' } });
    // --surface-base not set: falls back to light default #ffffff
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration);

    renderHook(() => useNativeStatusBar());

    await vi.waitFor(() => {
      expect(mockSetStatusBarStyle).toHaveBeenCalledWith('light');
      expect(mockSetStatusBarColor).toHaveBeenCalledWith('#ffffff'); // hardcoded: test expected — native-boundary hex
    });
  });

  it('is a no-op when not native', () => {
    mockIsNative.mockReturnValue(false);
    mockUseTheme.mockReturnValue({ theme: { id: 'modern' } });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration);

    renderHook(() => useNativeStatusBar());

    expect(mockSetStatusBarStyle).not.toHaveBeenCalled();
    expect(mockSetStatusBarColor).not.toHaveBeenCalled();
  });

  it('uses computed --surface-base hex when available', async () => {
    mockIsNative.mockReturnValue(true);
    mockUseTheme.mockReturnValue({ theme: { id: 'retro' } });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => 'rgb(10, 10, 10)', // hardcoded: test input — simulated CSS computed value
    } as unknown as CSSStyleDeclaration);

    renderHook(() => useNativeStatusBar());

    await vi.waitFor(() => {
      expect(mockSetStatusBarColor).toHaveBeenCalledWith('#0a0a0a'); // hardcoded: test expected — native-boundary hex
    });
  });
});
