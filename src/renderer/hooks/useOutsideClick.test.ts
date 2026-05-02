/**
 * @vitest-environment jsdom
 *
 * useOutsideClick — unit tests.
 *
 * Covers:
 *  - No-op when `open` is false (listener not attached).
 *  - Calls onClose when pointerdown fires outside the ref'd element.
 *  - Does NOT call onClose when pointerdown fires inside the ref'd element.
 *  - Removes the listener when the hook unmounts.
 *  - Removes the listener when `open` flips back to false.
 */

import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useOutsideClick } from './useOutsideClick';

function dispatchPointerDown(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

function setupHook(open: boolean, onClose: () => void) {
  const inside = document.createElement('div');
  document.body.appendChild(inside);
  const outside = document.createElement('div');
  document.body.appendChild(outside);

  const { unmount, rerender } = renderHook(
    ({ openArg }: { openArg: boolean }) => {
      const ref = useRef<HTMLDivElement>(inside);
      useOutsideClick(ref, openArg, onClose);
    },
    { initialProps: { openArg: open } },
  );

  return { inside, outside, unmount, rerender, cleanup: () => {
    inside.remove();
    outside.remove();
  } };
}

describe('useOutsideClick', () => {
  it('does not fire onClose when open is false', () => {
    const onClose = vi.fn();
    const { outside, unmount, cleanup } = setupHook(false, onClose);
    dispatchPointerDown(outside);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    cleanup();
  });

  it('fires onClose when pointerdown happens outside the ref', () => {
    const onClose = vi.fn();
    const { outside, unmount, cleanup } = setupHook(true, onClose);
    dispatchPointerDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    cleanup();
  });

  it('does not fire onClose when pointerdown happens inside the ref', () => {
    const onClose = vi.fn();
    const { inside, unmount, cleanup } = setupHook(true, onClose);
    dispatchPointerDown(inside);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    cleanup();
  });

  it('detaches the listener on unmount', () => {
    const onClose = vi.fn();
    const { outside, unmount, cleanup } = setupHook(true, onClose);
    unmount();
    dispatchPointerDown(outside);
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
  });

  it('detaches the listener when open flips back to false', () => {
    const onClose = vi.fn();
    const { outside, rerender, unmount, cleanup } = setupHook(true, onClose);
    rerender({ openArg: false });
    dispatchPointerDown(outside);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    cleanup();
  });
});
