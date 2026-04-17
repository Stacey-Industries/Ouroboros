/**
 * useGraphViewport.test.ts — unit tests for zoom/pan viewport hook.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MAX_SCALE, MIN_SCALE } from './GraphPanelTypes';
import { useGraphViewport } from './useGraphViewport';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWheelEvent(deltaY: number, offsetX = 0, offsetY = 0): React.WheelEvent<HTMLCanvasElement> {
  return {
    deltaY,
    preventDefault: () => {},
    nativeEvent: { offsetX, offsetY } as WheelEvent,
  } as unknown as React.WheelEvent<HTMLCanvasElement>;
}

function makePointerEvent(clientX: number, clientY: number): React.PointerEvent<HTMLCanvasElement> {
  return {
    clientX,
    clientY,
    pointerId: 1,
    target: { setPointerCapture: () => {} },
  } as unknown as React.PointerEvent<HTMLCanvasElement>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useGraphViewport', () => {
  it('starts with identity transform', () => {
    const { result } = renderHook(() => useGraphViewport());
    expect(result.current.transform).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('wheel up (negative deltaY) zooms in — increases scale', () => {
    const { result } = renderHook(() => useGraphViewport());
    act(() => { result.current.onWheel(makeWheelEvent(-100)); });
    expect(result.current.transform.scale).toBeGreaterThan(1);
  });

  it('wheel down (positive deltaY) zooms out — decreases scale', () => {
    const { result } = renderHook(() => useGraphViewport());
    act(() => { result.current.onWheel(makeWheelEvent(100)); });
    expect(result.current.transform.scale).toBeLessThan(1);
  });

  it('scale is clamped to MAX_SCALE on repeated zoom-in', () => {
    const { result } = renderHook(() => useGraphViewport());
    for (let i = 0; i < 100; i++) {
      act(() => { result.current.onWheel(makeWheelEvent(-500)); });
    }
    expect(result.current.transform.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it('scale is clamped to MIN_SCALE on repeated zoom-out', () => {
    const { result } = renderHook(() => useGraphViewport());
    for (let i = 0; i < 100; i++) {
      act(() => { result.current.onWheel(makeWheelEvent(500)); });
    }
    expect(result.current.transform.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('pointer drag updates x and y', () => {
    const { result } = renderHook(() => useGraphViewport());
    act(() => { result.current.onPointerDown(makePointerEvent(100, 100)); });
    act(() => { result.current.onPointerMove(makePointerEvent(150, 120)); });
    expect(result.current.transform.x).toBe(50);
    expect(result.current.transform.y).toBe(20);
  });

  it('pointer move without prior pointerDown is a no-op', () => {
    const { result } = renderHook(() => useGraphViewport());
    act(() => { result.current.onPointerMove(makePointerEvent(200, 200)); });
    expect(result.current.transform).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('pointerUp stops panning (subsequent move has no effect)', () => {
    const { result } = renderHook(() => useGraphViewport());
    act(() => { result.current.onPointerDown(makePointerEvent(0, 0)); });
    act(() => { result.current.onPointerUp(makePointerEvent(0, 0)); });
    act(() => { result.current.onPointerMove(makePointerEvent(100, 100)); });
    expect(result.current.transform.x).toBe(0);
    expect(result.current.transform.y).toBe(0);
  });

  it('resetView returns transform to identity', () => {
    const { result } = renderHook(() => useGraphViewport());
    act(() => { result.current.onWheel(makeWheelEvent(-300)); });
    act(() => { result.current.onPointerDown(makePointerEvent(0, 0)); });
    act(() => { result.current.onPointerMove(makePointerEvent(50, 50)); });
    act(() => { result.current.resetView(); });
    expect(result.current.transform).toEqual({ x: 0, y: 0, scale: 1 });
  });
});
