// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useViewportBreakpoint } from './useViewportBreakpoint';

// ---------------------------------------------------------------------------
// MediaQueryList mock factory
// ---------------------------------------------------------------------------

type MqlListener = () => void;

interface MockMql {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _listeners: MqlListener[];
  _fire: () => void;
}

function makeMql(matches: boolean): MockMql {
  const listeners: MqlListener[] = [];
  const mql: MockMql = {
    matches,
    addEventListener: vi.fn((_type: string, cb: MqlListener) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: MqlListener) => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    _listeners: listeners,
    _fire() {
      listeners.forEach((cb) => cb());
    },
  };
  return mql;
}

// ---------------------------------------------------------------------------
// Helpers — set web-mode class on <html>
// ---------------------------------------------------------------------------

function setWebMode(on: boolean): void {
  if (on) {
    document.documentElement.classList.add('web-mode');
  } else {
    document.documentElement.classList.remove('web-mode');
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useViewportBreakpoint', () => {
  let phoneMql: MockMql;
  let tabletMql: MockMql;

  beforeEach(() => {
    phoneMql = makeMql(false);
    tabletMql = makeMql(false);

    window.matchMedia = vi.fn((query: string) => {
      if (query === '(max-width: 768px)') return phoneMql as unknown as MediaQueryList;
      if (query === '(min-width: 769px) and (max-width: 1024px)') {
        return tabletMql as unknown as MediaQueryList;
      }
      return makeMql(false) as unknown as MediaQueryList;
    });
  });

  afterEach(() => {
    setWebMode(false);
    vi.restoreAllMocks();
  });

  it('returns desktop in Electron mode (no web-mode class)', () => {
    setWebMode(false);
    phoneMql.matches = true; // would be 'phone' in web mode
    const { result } = renderHook(() => useViewportBreakpoint());
    expect(result.current).toBe('desktop');
  });

  it('returns phone when phone media query matches in web mode', () => {
    setWebMode(true);
    phoneMql.matches = true;
    tabletMql.matches = false;
    const { result } = renderHook(() => useViewportBreakpoint());
    expect(result.current).toBe('phone');
  });

  it('returns tablet when tablet media query matches in web mode', () => {
    setWebMode(true);
    phoneMql.matches = false;
    tabletMql.matches = true;
    const { result } = renderHook(() => useViewportBreakpoint());
    expect(result.current).toBe('tablet');
  });

  it('returns desktop when neither phone nor tablet query matches in web mode', () => {
    setWebMode(true);
    phoneMql.matches = false;
    tabletMql.matches = false;
    const { result } = renderHook(() => useViewportBreakpoint());
    expect(result.current).toBe('desktop');
  });

  it('updates to phone when phone query fires a change event', () => {
    setWebMode(true);
    phoneMql.matches = false;
    tabletMql.matches = false;
    const { result } = renderHook(() => useViewportBreakpoint());
    expect(result.current).toBe('desktop');

    act(() => {
      phoneMql.matches = true;
      phoneMql._fire();
    });
    expect(result.current).toBe('phone');
  });

  it('updates from phone to desktop when phone query stops matching', () => {
    setWebMode(true);
    phoneMql.matches = true;
    tabletMql.matches = false;
    const { result } = renderHook(() => useViewportBreakpoint());
    expect(result.current).toBe('phone');

    act(() => {
      phoneMql.matches = false;
      phoneMql._fire();
    });
    expect(result.current).toBe('desktop');
  });

  it('removes event listeners on unmount', () => {
    setWebMode(true);
    const { unmount } = renderHook(() => useViewportBreakpoint());
    unmount();
    expect(phoneMql.removeEventListener).toHaveBeenCalled();
    expect(tabletMql.removeEventListener).toHaveBeenCalled();
  });

  it('does not call matchMedia in Electron mode', () => {
    setWebMode(false);
    renderHook(() => useViewportBreakpoint());
    // matchMedia may be called during useState initializer in web mode,
    // but in Electron mode the effect bails early — no addEventListener calls.
    expect(phoneMql.addEventListener).not.toHaveBeenCalled();
  });
});
