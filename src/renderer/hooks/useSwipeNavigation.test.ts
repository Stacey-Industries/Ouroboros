/**
 * @vitest-environment jsdom
 *
 * useSwipeNavigation — unit tests for Wave 32 Phase I.
 *
 * Synthesizes pointer events on a DOM element and asserts the correct
 * directional callback fires (or doesn't fire) based on distance, velocity,
 * axis dominance, data-no-swipe, scrollable-child, and enabled flag.
 */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSwipeNavigation } from './useSwipeNavigation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEl(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makeRef(el: HTMLDivElement): { current: HTMLDivElement } {
  return { current: el };
}

/**
 * Fire pointerdown then pointerup on `target`, with a configurable delta and
 * elapsed time so we can control both distance and velocity.
 */
function swipe(
  target: HTMLElement,
  opts: { dx?: number; dy?: number; dtMs?: number; eventTarget?: EventTarget },
): void {
  const startX = 200;
  const startY = 200;
  const startT = 1000;
  const dx = opts.dx ?? 0;
  const dy = opts.dy ?? 0;
  const dtMs = opts.dtMs ?? 100;
  const downTarget = opts.eventTarget ?? target;

  const down = new PointerEvent('pointerdown', {
    clientX: startX,
    clientY: startY,
    bubbles: true,
  });
  Object.defineProperty(down, 'timeStamp', { value: startT });
  Object.defineProperty(down, 'target', { value: downTarget });
  (downTarget as EventTarget).dispatchEvent(down);

  // pointerup fires on the element (not necessarily same as down target)
  const up = new PointerEvent('pointerup', {
    clientX: startX + dx,
    clientY: startY + dy,
    bubbles: true,
  });
  Object.defineProperty(up, 'timeStamp', { value: startT + dtMs });
  target.dispatchEvent(up);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useSwipeNavigation — x-axis (default)', () => {
  it('fires onSwipeLeft when swiping left past threshold + velocity', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeLeft = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3 }),
    );
    // dx=-100, dt=100ms → velocity 1 px/ms > 0.3
    swipe(el, { dx: -100, dy: 0, dtMs: 100 });
    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it('fires onSwipeRight when swiping right past threshold + velocity', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeRight = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeRight, threshold: 50, velocity: 0.3 }),
    );
    swipe(el, { dx: 100, dy: 0, dtMs: 100 });
    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it('does NOT fire when dx is below threshold', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeLeft = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3 }),
    );
    swipe(el, { dx: -30, dy: 0, dtMs: 50 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('does NOT fire when velocity is below minimum', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeLeft = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3 }),
    );
    // dx=-100, dt=1000ms → velocity 0.1 px/ms < 0.3
    swipe(el, { dx: -100, dy: 0, dtMs: 1000 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('does NOT fire when vertical movement dominates horizontal (diagonal swipe on x-axis)', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeLeft = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3 }),
    );
    // |dy|=150 > |dx|=80 → axis not dominant
    swipe(el, { dx: -80, dy: -150, dtMs: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('does NOT fire when target matches [data-no-swipe]', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const child = document.createElement('div');
    child.setAttribute('data-no-swipe', '');
    el.appendChild(child);
    const onSwipeLeft = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3 }),
    );
    swipe(el, { dx: -100, dy: 0, dtMs: 100, eventTarget: child });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('does NOT fire when pointer starts inside a horizontal scroller', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const scroller = document.createElement('div');
    // Fake a scrollable element
    Object.defineProperty(scroller, 'scrollWidth', { value: 800 });
    Object.defineProperty(scroller, 'clientWidth', { value: 300 });
    el.appendChild(scroller);
    const onSwipeLeft = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3 }),
    );
    swipe(el, { dx: -100, dy: 0, dtMs: 100, eventTarget: scroller });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('is a no-op when enabled is false', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeLeft = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3, enabled: false }),
    );
    swipe(el, { dx: -100, dy: 0, dtMs: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});

describe('useSwipeNavigation — y-axis', () => {
  it('fires onSwipeDown when swiping down past threshold + velocity', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeDown = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeDown, axis: 'y', threshold: 50, velocity: 0.3 }),
    );
    swipe(el, { dx: 0, dy: 100, dtMs: 100 });
    expect(onSwipeDown).toHaveBeenCalledOnce();
  });

  it('fires onSwipeUp when swiping up past threshold + velocity', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeUp = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeUp, axis: 'y', threshold: 50, velocity: 0.3 }),
    );
    swipe(el, { dx: 0, dy: -100, dtMs: 100 });
    expect(onSwipeUp).toHaveBeenCalledOnce();
  });

  it('does NOT fire onSwipeDown when vertical scroller is in ancestry', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'scrollHeight', { value: 900 });
    Object.defineProperty(scroller, 'clientHeight', { value: 300 });
    el.appendChild(scroller);
    const onSwipeDown = vi.fn();
    renderHook(() =>
      useSwipeNavigation(ref, { onSwipeDown, axis: 'y', threshold: 50, velocity: 0.3 }),
    );
    swipe(el, { dx: 0, dy: 100, dtMs: 100, eventTarget: scroller });
    expect(onSwipeDown).not.toHaveBeenCalled();
  });
});

describe('useSwipeNavigation — cleanup', () => {
  it('removes listeners on unmount and stops firing', () => {
    const el = makeEl();
    const ref = makeRef(el);
    const onSwipeLeft = vi.fn();
    const { unmount } = renderHook(() =>
      useSwipeNavigation(ref, { onSwipeLeft, threshold: 50, velocity: 0.3 }),
    );
    unmount();
    swipe(el, { dx: -100, dy: 0, dtMs: 100 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
