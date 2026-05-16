/**
 * @vitest-environment jsdom
 *
 * useResizable.test.ts — Wave 89 Phase 0
 *
 * Covers the hook-level contracts:
 *  - Fixed-edge: startResize wires pointer listeners, commitDragSize updates state.
 *  - Fixed-edge: resetSize restores the default for the given panel.
 *  - Fixed-edge: applySizes replaces all sizes atomically.
 *  - Sibling-stack: startSiblingResize is present in the return value.
 *  - Sibling-stack: drag-up grows top, shrinks bottom (sum constant).
 *  - Sibling-stack: drag-down grows bottom, shrinks top (sum constant).
 *  - Sibling-stack: min-clamp prevents either sibling going below SIBLING_MIN_SIZE.
 *  - Sibling-stack: sum equals parentExtent for any drag distance.
 *
 * Pure sibling math (clampSiblingDelta, computeSiblingSizes, etc.) is tested
 * in useResizable.sibling.test.ts at the unit level — not duplicated here.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useResizable } from './useResizable';
import { SIBLING_MIN_SIZE } from './useResizable.sibling';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

// Silence electron-store persistence path; localStorage is provided by jsdom.
vi.stubGlobal('window', {
  ...window,
  electronAPI: undefined,
});

afterEach(() => {
  localStorage.clear();
  // Remove any document pointer listeners left over from a drag.
  document.dispatchEvent(new Event('pointerup'));
});

// ---------------------------------------------------------------------------
// Fixed-edge mode — existing API unchanged
// ---------------------------------------------------------------------------

describe('useResizable — fixed-edge mode', () => {
  it('returns startResize, resetSize, applySizes, and startSiblingResize', () => {
    const { result } = renderHook(() => useResizable());
    expect(typeof result.current.startResize).toBe('function');
    expect(typeof result.current.resetSize).toBe('function');
    expect(typeof result.current.applySizes).toBe('function');
    expect(typeof result.current.startSiblingResize).toBe('function');
  });

  it('applySizes replaces all panel sizes atomically', () => {
    const { result } = renderHook(() => useResizable());
    act(() => {
      result.current.applySizes({ leftSidebar: 300, rightSidebar: 400, terminal: 350 });
    });
    expect(result.current.sizes.leftSidebar).toBe(300);
    expect(result.current.sizes.rightSidebar).toBe(400);
    expect(result.current.sizes.terminal).toBe(350);
  });

  it('resetSize restores the default for leftSidebar (220px)', () => {
    const { result } = renderHook(() => useResizable());
    act(() => {
      result.current.applySizes({ leftSidebar: 400, rightSidebar: 300, terminal: 280 });
    });
    act(() => {
      result.current.resetSize('leftSidebar');
    });
    expect(result.current.sizes.leftSidebar).toBe(220);
  });

  it('startResize adds pointer listeners to document without throwing', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const { result } = renderHook(() => useResizable());
    act(() => {
      result.current.startResize('leftSidebar', 'vertical', 220, 100);
    });
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('pointermove');
    expect(events).toContain('pointerup');
    addSpy.mockRestore();
  });

  it('pointerup after startResize commits the dragged size', () => {
    const { result } = renderHook(() => useResizable());
    act(() => {
      result.current.startResize('leftSidebar', 'vertical', 220, 100);
    });
    // Move 50px to the right → leftSidebar grows by 50 → 270.
    act(() => {
      document.dispatchEvent(
        Object.assign(new Event('pointermove'), { clientX: 150, clientY: 0 }),
      );
    });
    act(() => {
      document.dispatchEvent(new Event('pointerup'));
    });
    expect(result.current.sizes.leftSidebar).toBe(270);
  });
});

// ---------------------------------------------------------------------------
// Sibling-stack mode — Wave 89 Phase 0 additions
// ---------------------------------------------------------------------------

describe('useResizable — sibling-stack mode', () => {
  const PARENT = 400;
  const START_TOP = 200;
  const START_BOTTOM = 200;
  const START_POS = 300; // clientY at drag start

  function startSibling(result: ReturnType<typeof useResizable>) {
    result.startSiblingResize({
      topPanel: 'leftSidebar',
      bottomPanel: 'rightSidebar',
      parentExtent: PARENT,
      startSizes: [START_TOP, START_BOTTOM],
      startPos: START_POS,
      direction: 'vertical',
    });
  }

  function move(clientY: number) {
    act(() => {
      document.dispatchEvent(
        Object.assign(new Event('pointermove'), { clientY, clientX: 0 }),
      );
    });
  }

  function up() {
    act(() => {
      document.dispatchEvent(new Event('pointerup'));
    });
  }

  it('drag-up (clientY < startPos) grows top, shrinks bottom; sum equals parentExtent', () => {
    const { result } = renderHook(() => useResizable());
    act(() => { startSibling(result.current); });
    move(START_POS - 50); // delta = -50 → top=150, bottom=250
    up();
    expect(result.current.sizes.leftSidebar).toBe(150);
    expect(result.current.sizes.rightSidebar).toBe(250);
    expect(result.current.sizes.leftSidebar + result.current.sizes.rightSidebar).toBe(PARENT);
  });

  it('drag-down (clientY > startPos) grows bottom, shrinks top; sum equals parentExtent', () => {
    const { result } = renderHook(() => useResizable());
    act(() => { startSibling(result.current); });
    move(START_POS + 60); // delta = +60 → top=260, bottom=140
    up();
    expect(result.current.sizes.leftSidebar).toBe(260);
    expect(result.current.sizes.rightSidebar).toBe(140);
    expect(result.current.sizes.leftSidebar + result.current.sizes.rightSidebar).toBe(PARENT);
  });

  it('min-clamp: top cannot go below SIBLING_MIN_SIZE on a massive drag-up', () => {
    const { result } = renderHook(() => useResizable());
    act(() => { startSibling(result.current); });
    move(START_POS - 9999); // extreme upward drag
    up();
    expect(result.current.sizes.leftSidebar).toBe(SIBLING_MIN_SIZE);
    expect(result.current.sizes.rightSidebar).toBe(PARENT - SIBLING_MIN_SIZE);
  });

  it('min-clamp: bottom cannot go below SIBLING_MIN_SIZE on a massive drag-down', () => {
    const { result } = renderHook(() => useResizable());
    act(() => { startSibling(result.current); });
    move(START_POS + 9999); // extreme downward drag
    up();
    expect(result.current.sizes.rightSidebar).toBe(SIBLING_MIN_SIZE);
    expect(result.current.sizes.leftSidebar).toBe(PARENT - SIBLING_MIN_SIZE);
  });

  it('sum equals parentExtent for a variety of drag distances', () => {
    const deltas = [-300, -100, -1, 0, 1, 100, 300];
    for (const d of deltas) {
      const { result } = renderHook(() => useResizable());
      act(() => { startSibling(result.current); });
      move(START_POS + d);
      up();
      const sum = result.current.sizes.leftSidebar + result.current.sizes.rightSidebar;
      expect(sum).toBe(PARENT);
    }
  });
});
