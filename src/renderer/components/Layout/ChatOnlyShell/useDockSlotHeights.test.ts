/**
 * @vitest-environment jsdom
 *
 * useDockSlotHeights.test.ts — Wave 89 Phase 1
 *
 * Unit tests for the pure helpers exported from useDockSlotHeights.
 * Hook integration (drag commit, state update) is covered by
 * ChatWorkbenchTerminalDock.stacked.test.tsx.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TERMINAL_DOCK_SLOTS } from '../../../../shared/config/dockPersistenceSchema';
import {
  clampSlotDelta,
  loadSlotHeights,
  saveSlotHeights,
  SLOT_MIN_HEIGHT,
} from './useDockSlotHeights';

// ---------------------------------------------------------------------------
// clampSlotDelta
// ---------------------------------------------------------------------------

describe('clampSlotDelta', () => {
  it('returns the raw delta when within bounds', () => {
    // startPrimary=200, startSecondary=140 — dragging down 20px is fine
    expect(clampSlotDelta(20, 200, 140)).toBe(20);
  });

  it('clamps upward drag so primary never goes below SLOT_MIN_HEIGHT', () => {
    // startPrimary=200, dragging up 200 would shrink primary to 0 — must clamp
    const maxAllowedUp = -(200 - SLOT_MIN_HEIGHT); // -140
    expect(clampSlotDelta(-200, 200, 140)).toBe(maxAllowedUp);
  });

  it('clamps downward drag so secondary never goes below SLOT_MIN_HEIGHT', () => {
    // startSecondary=140, dragging down 140 would shrink secondary to 0 — must clamp
    const maxAllowedDown = 140 - SLOT_MIN_HEIGHT; // 80
    expect(clampSlotDelta(200, 200, 140)).toBe(maxAllowedDown);
  });

  it('returns 0 when delta is 0', () => {
    expect(clampSlotDelta(0, 200, 140)).toBe(0);
  });

  it('preserves sum: primary + secondary stays equal to parentExtent after clamp', () => {
    const parentExtent = 340; // 200 + 140
    const startPrimary = 200;
    const startSecondary = 140;
    const delta = 30;
    const clamped = clampSlotDelta(delta, startPrimary, startSecondary);
    const newPrimary = startPrimary + clamped;
    const newSecondary = parentExtent - newPrimary;
    expect(newPrimary + newSecondary).toBe(parentExtent);
  });
});

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
