/**
 * useSwipeNavigation — pointer-based swipe gesture hook.
 *
 * Attaches pointerdown/pointerup/pointercancel listeners to a target element
 * and fires directional callbacks when a swipe gesture meets the threshold and
 * velocity requirements.
 *
 * Opt-outs:
 *   - `data-no-swipe` attribute on any ancestor of the pointer target
 *   - Horizontal scrollers (scrollWidth > clientWidth) block x-axis swipes
 *   - Vertical scrollers (scrollHeight > clientHeight) block y-axis swipes
 *
 * Wave 32 Phase I — swipe gesture infrastructure.
 */

import { type RefObject, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
  onSwipeUp?: () => void;
  /** Axis to track. Default: 'x' */
  axis?: 'x' | 'y';
  /** Minimum distance in px to trigger swipe. Default: 50 */
  threshold?: number;
  /** Minimum speed in px/ms to trigger swipe. Default: 0.3 */
  velocity?: number;
  /** Set false to disable all gesture handling. Default: true */
  enabled?: boolean;
}

interface GestureState {
  startX: number;
  startY: number;
  startT: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNoSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('[data-no-swipe]'));
}

function hasHorizontalScroll(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  let node: Element | null = target as Element;
  while (node) {
    if (node.scrollWidth > node.clientWidth) return true;
    node = node.parentElement;
  }
  return false;
}

function hasVerticalScroll(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  let node: Element | null = target as Element;
  while (node) {
    if (node.scrollHeight > node.clientHeight) return true;
    node = node.parentElement;
  }
  return false;
}

interface DispatchArgs {
  dx: number;
  dy: number;
  dt: number;
  threshold: number;
  velocity: number;
  options: SwipeNavigationOptions;
}

function dispatchXSwipe({ dx, dy, dt, threshold, velocity, options }: DispatchArgs): void {
  if (Math.abs(dx) <= threshold) return;
  if (Math.abs(dx) / dt <= velocity) return;
  if (Math.abs(dx) <= Math.abs(dy)) return;
  if (dx < 0) { options.onSwipeLeft?.(); } else { options.onSwipeRight?.(); }
}

function dispatchYSwipe({ dx, dy, dt, threshold, velocity, options }: DispatchArgs): void {
  if (Math.abs(dy) <= threshold) return;
  if (Math.abs(dy) / dt <= velocity) return;
  if (Math.abs(dy) <= Math.abs(dx)) return;
  if (dy > 0) { options.onSwipeDown?.(); } else { options.onSwipeUp?.(); }
}

// ── Listener builders ─────────────────────────────────────────────────────────

function makePointerDown(
  gestureRef: { state: GestureState | null },
  optionsRef: { current: SwipeNavigationOptions },
) {
  return function onPointerDown(e: PointerEvent): void {
    const opts = optionsRef.current;
    if (opts.enabled === false) return;
    if (isNoSwipeTarget(e.target)) return;
    if (opts.axis !== 'y' && hasHorizontalScroll(e.target)) return;
    if (opts.axis === 'y' && hasVerticalScroll(e.target)) return;
    gestureRef.state = { startX: e.clientX, startY: e.clientY, startT: e.timeStamp };
  };
}

function makePointerUp(
  gestureRef: { state: GestureState | null },
  optionsRef: { current: SwipeNavigationOptions },
) {
  return function onPointerUp(e: PointerEvent): void {
    const state = gestureRef.state;
    gestureRef.state = null;
    if (!state) return;
    const opts = optionsRef.current;
    if (opts.enabled === false) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const dt = Math.max(e.timeStamp - state.startT, 1);
    const thr = opts.threshold ?? 50;
    const vel = opts.velocity ?? 0.3;
    const args: DispatchArgs = { dx, dy, dt, threshold: thr, velocity: vel, options: opts };
    if (opts.axis === 'y') { dispatchYSwipe(args); } else { dispatchXSwipe(args); }
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSwipeNavigation(
  target: RefObject<HTMLElement | null>,
  options: SwipeNavigationOptions,
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const gestureRef: { state: GestureState | null } = { state: null };
    const onPointerDown = makePointerDown(gestureRef, optionsRef);
    const onPointerUp = makePointerUp(gestureRef, optionsRef);
    const onPointerCancel = (): void => { gestureRef.state = null; };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [target]);
}
