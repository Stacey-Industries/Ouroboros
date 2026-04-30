// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from './useIsMobile';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockMatchMedia(phoneMatches: boolean): void {
  window.matchMedia = vi.fn((query: string) => {
    const matches = query.includes('max-width: 768px') ? phoneMatches : false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useIsMobile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when viewport is phone-sized (≤768px)', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when viewport is not phone-sized', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns false when window.matchMedia is not available (SSR/Electron without matchMedia)', () => {
    const original = window.matchMedia;
    // @ts-expect-error — simulate missing matchMedia
    delete window.matchMedia;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    window.matchMedia = original;
  });

  it('returns a boolean', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe('boolean');
  });

  it('updates when viewport changes', () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | undefined;
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: '(max-width: 768px)',
      onchange: null,
      addEventListener: vi.fn((_: string, handler: (e: MediaQueryListEvent) => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      changeHandler?.({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });
});
