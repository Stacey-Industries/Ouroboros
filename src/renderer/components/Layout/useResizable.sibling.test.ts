/**
 * useResizable.sibling.test.ts
 *
 * Unit tests for the pure sibling-stack resize logic extracted in Wave 89 Phase 0.
 * These are pyramid-tier tests: no React, no DOM, pure math functions.
 *
 * Contracts verified:
 *  - clampSiblingDelta: enforces SIBLING_MIN_SIZE on both sides.
 *  - computeSiblingSizes: sum always equals parentExtent; clamping holds.
 *  - commitSiblingDrag: writes both panels to state and calls saveSizes.
 *  - buildSiblingDragState: constructs state from opts with correct defaults.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  buildSiblingDragState,
  clampSiblingDelta,
  commitSiblingDrag,
  computeSiblingSizes,
  SIBLING_MIN_SIZE,
} from './useResizable.sibling';

// ---------------------------------------------------------------------------
// clampSiblingDelta
// ---------------------------------------------------------------------------

describe('clampSiblingDelta', () => {
  it('returns the raw delta when both siblings stay above min size', () => {
    // top=200, bottom=200, min=60 → can move ±140
    expect(clampSiblingDelta(50, 200, 200)).toBe(50);
    expect(clampSiblingDelta(-50, 200, 200)).toBe(-50);
  });

  it('clamps upward drag when top would go below SIBLING_MIN_SIZE', () => {
    // top=100, min=60 → max up-delta = -(100-60) = -40
    expect(clampSiblingDelta(-80, 100, 300)).toBe(-40);
  });

  it('clamps downward drag when bottom would go below SIBLING_MIN_SIZE', () => {
    // bottom=80, min=60 → max down-delta = 80-60 = 20
    expect(clampSiblingDelta(50, 300, 80)).toBe(20);
  });

  it('returns 0 (no motion) when top is already at SIBLING_MIN_SIZE and drag is upward', () => {
    // Math.max(-0, -1) === -0 in JS; we only care that no motion occurs.
    expect(clampSiblingDelta(-1, SIBLING_MIN_SIZE, 300)).toBeCloseTo(0, 10);
  });

  it('returns 0 (no motion) when bottom is already at SIBLING_MIN_SIZE and drag is downward', () => {
    expect(clampSiblingDelta(1, 300, SIBLING_MIN_SIZE)).toBeCloseTo(0, 10);
  });
});

// ---------------------------------------------------------------------------
// computeSiblingSizes
// ---------------------------------------------------------------------------

describe('computeSiblingSizes', () => {
  const baseState = {
    topPanel: 'terminal' as const,
    bottomPanel: 'terminal' as const,
    direction: 'vertical' as const,
    parentExtent: 400,
    startTopSize: 200,
    startPos: 300,
    currentSizes: [200, 200] as [number, number],
  };

  function makeEvent(clientY: number): PointerEvent {
    return { clientY, clientX: 0 } as PointerEvent;
  }

  it('drag-down grows bottom, shrinks top; sum equals parentExtent', () => {
    // startPos=300, clientY=350 → delta=+50 → top=250, bottom=150
    const [top, bottom] = computeSiblingSizes(baseState, makeEvent(350));
    expect(top).toBe(250);
    expect(bottom).toBe(150);
    expect(top + bottom).toBe(baseState.parentExtent);
  });

  it('drag-up grows top, shrinks bottom; sum equals parentExtent', () => {
    // startPos=300, clientY=250 → delta=-50 → top=150, bottom=250
    const [top, bottom] = computeSiblingSizes(baseState, makeEvent(250));
    expect(top).toBe(150);
    expect(bottom).toBe(250);
    expect(top + bottom).toBe(baseState.parentExtent);
  });

  it('clamps so top never goes below SIBLING_MIN_SIZE; sum still equals parentExtent', () => {
    // Massive upward drag: clientY=0 → delta=-300 → raw top=-100 → clamped to min
    const [top, bottom] = computeSiblingSizes(baseState, makeEvent(0));
    expect(top).toBe(SIBLING_MIN_SIZE);
    expect(bottom).toBe(baseState.parentExtent - SIBLING_MIN_SIZE);
    expect(top + bottom).toBe(baseState.parentExtent);
  });

  it('clamps so bottom never goes below SIBLING_MIN_SIZE; sum still equals parentExtent', () => {
    // Massive downward drag: clientY=600 → delta=+300 → clamped to bottom min
    const [top, bottom] = computeSiblingSizes(baseState, makeEvent(600));
    expect(bottom).toBe(SIBLING_MIN_SIZE);
    expect(top).toBe(baseState.parentExtent - SIBLING_MIN_SIZE);
    expect(top + bottom).toBe(baseState.parentExtent);
  });

  it('preserves parentExtent sum for any arbitrary drag distance', () => {
    const deltas = [-500, -200, -100, -1, 0, 1, 100, 200, 500];
    for (const d of deltas) {
      const [top, bottom] = computeSiblingSizes(baseState, makeEvent(baseState.startPos + d));
      expect(top + bottom).toBe(baseState.parentExtent);
    }
  });

  it('uses clientX delta for horizontal direction', () => {
    const hState = { ...baseState, direction: 'horizontal' as const };
    const event = { clientX: 350, clientY: 0 } as PointerEvent;
    // startPos=300, clientX=350 → delta=+50
    const [top, bottom] = computeSiblingSizes(hState, event);
    expect(top).toBe(250);
    expect(bottom).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// commitSiblingDrag
// ---------------------------------------------------------------------------

describe('commitSiblingDrag', () => {
  it('does nothing when dragState is null', () => {
    const setSizes = vi.fn();
    const saveSizes = vi.fn();
    commitSiblingDrag(null, setSizes, saveSizes);
    expect(setSizes).not.toHaveBeenCalled();
    expect(saveSizes).not.toHaveBeenCalled();
  });

  it('writes both panel sizes from currentSizes and calls saveSizes', () => {
    const setSizes = vi.fn((updater: (prev: object) => object) => updater({}));
    const saveSizes = vi.fn();
    const dragState = {
      topPanel: 'leftSidebar' as const,
      bottomPanel: 'rightSidebar' as const,
      direction: 'vertical' as const,
      parentExtent: 400,
      startTopSize: 200,
      startPos: 300,
      currentSizes: [180, 220] as [number, number],
    };
    commitSiblingDrag(dragState, setSizes, saveSizes);
    expect(setSizes).toHaveBeenCalledOnce();
    expect(saveSizes).toHaveBeenCalledOnce();
    const saved = saveSizes.mock.calls[0][0] as Record<string, number>;
    expect(saved['leftSidebar']).toBe(180);
    expect(saved['rightSidebar']).toBe(220);
  });
});

// ---------------------------------------------------------------------------
// buildSiblingDragState
// ---------------------------------------------------------------------------

describe('buildSiblingDragState', () => {
  it('defaults direction to vertical when omitted', () => {
    const state = buildSiblingDragState({
      topPanel: 'leftSidebar',
      bottomPanel: 'rightSidebar',
      parentExtent: 400,
      startSizes: [200, 200],
      startPos: 300,
    });
    expect(state.direction).toBe('vertical');
  });

  it('propagates all fields from opts correctly', () => {
    const state = buildSiblingDragState({
      topPanel: 'leftSidebar',
      bottomPanel: 'terminal',
      parentExtent: 500,
      startSizes: [300, 200],
      startPos: 150,
      direction: 'horizontal',
    });
    expect(state.topPanel).toBe('leftSidebar');
    expect(state.bottomPanel).toBe('terminal');
    expect(state.parentExtent).toBe(500);
    expect(state.startTopSize).toBe(300);
    expect(state.startPos).toBe(150);
    expect(state.direction).toBe('horizontal');
    expect(state.currentSizes).toEqual([300, 200]);
  });
});
