/**
 * @vitest-environment jsdom
 *
 * MobileOverlayShell — unit tests for shared overlay primitives.
 * Wave 32 Phase F.
 */

import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import React, { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Scrim,
  useBodyScrollLock,
  useEscapeKey,
  useFocusTrap,
} from './MobileOverlayShell';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

// ── Scrim ─────────────────────────────────────────────────────────────────────

describe('Scrim', () => {
  it('calls onClose when clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<Scrim onClose={onClose} />);
    fireEvent.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders with role="presentation"', () => {
    const { container } = render(<Scrim onClose={vi.fn()} />);
    expect(container.firstElementChild?.getAttribute('role')).toBe('presentation');
  });
});

// ── useBodyScrollLock ─────────────────────────────────────────────────────────

describe('useBodyScrollLock', () => {
  it('sets overflow hidden when open', () => {
    renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not set overflow when closed', () => {
    document.body.style.overflow = '';
    renderHook(() => useBodyScrollLock(false));
    expect(document.body.style.overflow).toBe('');
  });

  it('restores previous overflow on cleanup', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });
});

// ── useEscapeKey ──────────────────────────────────────────────────────────────

describe('useEscapeKey', () => {
  it('calls onClose when Escape is pressed and isOpen=true', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(true, onClose));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when isOpen=false', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(false, onClose));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(true, onClose));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes listener on cleanup', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(true, onClose));
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── useFocusTrap ──────────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  it('focuses first focusable element on open', () => {
    function Wrapper(): React.ReactElement {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, true);
      return (
        <div ref={ref}>
          <button data-testid="first">First</button>
          <button data-testid="second">Second</button>
        </div>
      );
    }
    const { getByTestId } = render(<Wrapper />);
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('wraps Tab from last focusable to first', () => {
    function Wrapper(): React.ReactElement {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, true);
      return (
        <div ref={ref}>
          <button data-testid="first">A</button>
          <button data-testid="last">B</button>
        </div>
      );
    }
    const { getByTestId } = render(<Wrapper />);
    act(() => { getByTestId('last').focus(); });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('wraps Shift+Tab from first focusable to last', () => {
    function Wrapper(): React.ReactElement {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, true);
      return (
        <div ref={ref}>
          <button data-testid="first">A</button>
          <button data-testid="last">B</button>
        </div>
      );
    }
    const { getByTestId } = render(<Wrapper />);
    act(() => { getByTestId('first').focus(); });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('last'));
  });
});
