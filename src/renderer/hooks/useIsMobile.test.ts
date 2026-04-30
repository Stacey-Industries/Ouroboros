// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from './useIsMobile';

// ── Helpers ──────────────────────────────────────────────────────────────────

function setWebMode(enabled: boolean): void {
  if (enabled) {
    document.documentElement.classList.add('web-mode');
  } else {
    document.documentElement.classList.remove('web-mode');
  }
}

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
    setWebMode(false);
    vi.restoreAllMocks();
  });

  describe('Electron mode (no web-mode class)', () => {
    beforeEach(() => {
      setWebMode(false);
    });

    it('returns false regardless of viewport width', () => {
      mockMatchMedia(true); // phone-sized but Electron mode
      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);
    });

    it('returns false without matchMedia being called', () => {
      const matchMediaSpy = vi.fn();
      window.matchMedia = matchMediaSpy;
      renderHook(() => useIsMobile());
      expect(matchMediaSpy).not.toHaveBeenCalled();
    });
  });

  describe('web mode (web-mode class present)', () => {
    beforeEach(() => {
      setWebMode(true);
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
  });

  describe('return type', () => {
    it('returns a boolean', () => {
      const { result } = renderHook(() => useIsMobile());
      expect(typeof result.current).toBe('boolean');
    });
  });
});
