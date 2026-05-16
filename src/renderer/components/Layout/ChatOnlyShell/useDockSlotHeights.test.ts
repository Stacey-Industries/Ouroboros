/**
 * @vitest-environment jsdom
 *
 * useDockSlotHeights.test.ts — Wave 89 Phase 1 (revised per Phase 1 review)
 *
 * Unit tests for the persistence helpers exported from useDockSlotHeights.
 * Bespoke clamp / preview-line tests removed — that logic was deleted and is
 * now covered by useResizable.sibling.test.ts (clampSiblingDelta) and
 * useResizable.test.ts (sibling-stack mode end-to-end).
 *
 * Tests retained:
 *  - loadSlotHeights / saveSlotHeights localStorage round-trip
 *  - migrateDockPersistence integration (legacy dockHeight forward-migration)
 *  - buildSiblingOpts delegates to startSiblingResize with correct args
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TERMINAL_DOCK_SLOTS } from '../../../../shared/config/dockPersistenceSchema';
import { loadSlotHeights, saveSlotHeights, useDockSlotHeights } from './useDockSlotHeights';

// ---------------------------------------------------------------------------
// loadSlotHeights / saveSlotHeights — localStorage round-trip
// ---------------------------------------------------------------------------

describe('loadSlotHeights', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns defaults when localStorage is empty', () => {
    const result = loadSlotHeights();
    expect(result).toEqual(DEFAULT_TERMINAL_DOCK_SLOTS);
  });

  it('returns persisted values when they exist', () => {
    saveSlotHeights({ primary: 250, secondary: 180 });
    const result = loadSlotHeights();
    expect(result).toEqual({ primary: 250, secondary: 180 });
  });

  it('drops legacy dockHeight on saveSlotHeights and reads new slots on next load', () => {
    // Simulate a Wave-88-era persisted value with the legacy key
    localStorage.setItem('agent-ide:dock-persistence', JSON.stringify({ dockHeight: 300 }));
    // saveSlotHeights should write new schema and drop dockHeight
    saveSlotHeights({ primary: 180, secondary: 120 });
    const raw = JSON.parse(localStorage.getItem('agent-ide:dock-persistence') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(raw.dockHeight).toBeUndefined();
    expect(raw.terminalDockSlots).toEqual({ primary: 180, secondary: 120 });
  });

  it('falls back to defaults when localStorage contains invalid JSON', () => {
    localStorage.setItem('agent-ide:dock-persistence', 'not-json');
    const result = loadSlotHeights();
    expect(result).toEqual(DEFAULT_TERMINAL_DOCK_SLOTS);
  });

  it('seeds from legacy dockHeight via migrateDockPersistence on load', () => {
    // Write a legacy-era object; loadSlotHeights should derive slots via 60/40 split
    localStorage.setItem('agent-ide:dock-persistence', JSON.stringify({ dockHeight: 300 }));
    const result = loadSlotHeights();
    // primary = round(300 * 0.6) = 180, secondary = 300 - 180 = 120
    expect(result).toEqual({ primary: 180, secondary: 120 });
  });
});

// ---------------------------------------------------------------------------
// buildSiblingOpts — delegates to startSiblingResize (ADR Decision 1)
// ---------------------------------------------------------------------------

describe('useDockSlotHeights — buildSiblingOpts delegates to startSiblingResize', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('buildSiblingOpts returns opts with correct parentExtent, startSizes, and direction', () => {
    const { result } = renderHook(() => useDockSlotHeights());
    const opts = result.current.buildSiblingOpts(300, 250);
    expect(opts.parentExtent).toBe(300);
    expect(opts.startPos).toBe(250);
    expect(opts.startSizes).toEqual([
      DEFAULT_TERMINAL_DOCK_SLOTS.primary,
      DEFAULT_TERMINAL_DOCK_SLOTS.secondary,
    ]);
    expect(opts.direction).toBe('vertical');
  });

  it('buildSiblingOpts provides an onCommit callback that persists slot heights', () => {
    const { result } = renderHook(() => useDockSlotHeights());
    const opts = result.current.buildSiblingOpts(300, 250);
    expect(typeof opts.onCommit).toBe('function');
    // Invoke onCommit directly — simulates what startSiblingResize does on pointerup.
    opts.onCommit?.([170, 130]);
    const stored = JSON.parse(
      localStorage.getItem('agent-ide:dock-persistence') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored.terminalDockSlots).toEqual({ primary: 170, secondary: 130 });
  });
});
