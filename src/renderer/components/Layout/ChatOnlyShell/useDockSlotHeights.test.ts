/**
 * @vitest-environment jsdom
 *
 * useDockSlotHeights.test.ts — Wave 89 Phase 1 (revised per Phase 1 review)
 * Wave 89 Phase 4c: adds collapse persistence + sibling-height computation tests.
 *
 * Unit tests for the persistence helpers exported from useDockSlotHeights.
 * Bespoke clamp / preview-line tests removed — that logic was deleted and is
 * now covered by useResizable.sibling.test.ts (clampSiblingDelta) and
 * useResizable.test.ts (sibling-stack mode end-to-end).
 *
 * Tests retained from Phase 1:
 *  - loadSlotHeights / saveSlotHeights localStorage round-trip
 *  - migrateDockPersistence integration (legacy dockHeight forward-migration)
 *  - buildSiblingOpts delegates to startSiblingResize with correct args
 *
 * Tests added in Phase 4c:
 *  - loadSlotsCollapsed / saveSlotsCollapsed round-trip
 *  - forward-migration: absent terminalDockSlotsCollapsed seeds defaults
 *  - computeSlotDisplayHeights: one slot collapsed, other grows
 *  - computeSlotDisplayHeights: both collapsed → two 28px strips
 *  - toggleSlotCollapsed hook integration: persists + returns new state
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TERMINAL_DOCK_SLOTS,
  DEFAULT_TERMINAL_DOCK_SLOTS_COLLAPSED,
} from '../../../../shared/config/dockPersistenceSchema';
import {
  COLLAPSED_HEADER_HEIGHT,
  computeSlotDisplayHeights,
  loadSlotHeights,
  loadSlotsCollapsed,
  saveSlotHeights,
  saveSlotsCollapsed,
  useDockSlotHeights,
} from './useDockSlotHeights';

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
// loadSlotsCollapsed / saveSlotsCollapsed — collapse persistence round-trip
// ---------------------------------------------------------------------------

describe('loadSlotsCollapsed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns default collapsed state (both false) when localStorage is empty', () => {
    const result = loadSlotsCollapsed();
    expect(result).toEqual(DEFAULT_TERMINAL_DOCK_SLOTS_COLLAPSED);
    expect(result.primary).toBe(false);
    expect(result.secondary).toBe(false);
  });

  it('round-trips collapsed state: save primary=true then load reads primary=true', () => {
    saveSlotsCollapsed({ primary: true, secondary: false });
    const result = loadSlotsCollapsed();
    expect(result.primary).toBe(true);
    expect(result.secondary).toBe(false);
  });

  it('round-trips collapsed state: save secondary=true then load reads secondary=true', () => {
    saveSlotsCollapsed({ primary: false, secondary: true });
    const result = loadSlotsCollapsed();
    expect(result.primary).toBe(false);
    expect(result.secondary).toBe(true);
  });

  it('seeds collapsed defaults when existing data lacks terminalDockSlotsCollapsed', () => {
    // Simulate pre-Phase-4c stored data (has slots but no collapsed key)
    localStorage.setItem(
      'agent-ide:dock-persistence',
      JSON.stringify({ terminalDockSlots: { primary: 250, secondary: 180 } }),
    );
    const result = loadSlotsCollapsed();
    expect(result).toEqual({ primary: false, secondary: false });
  });

  it('preserves slot heights when writing collapsed state', () => {
    saveSlotHeights({ primary: 200, secondary: 150 });
    saveSlotsCollapsed({ primary: true, secondary: false });
    // slot heights must survive the collapsed write
    const heights = loadSlotHeights();
    expect(heights).toEqual({ primary: 200, secondary: 150 });
  });

  it('falls back to defaults when localStorage contains invalid JSON', () => {
    localStorage.setItem('agent-ide:dock-persistence', 'bad-json');
    const result = loadSlotsCollapsed();
    expect(result).toEqual(DEFAULT_TERMINAL_DOCK_SLOTS_COLLAPSED);
  });
});

// ---------------------------------------------------------------------------
// computeSlotDisplayHeights — sibling-height math when slots are collapsed
// ---------------------------------------------------------------------------

describe('computeSlotDisplayHeights', () => {
  const heights = { primary: 300, secondary: 200 };
  const parentExtent = 600;

  it('returns stored heights unchanged when neither slot is collapsed', () => {
    const result = computeSlotDisplayHeights(heights, { primary: false, secondary: false }, parentExtent);
    expect(result).toEqual({ primary: 300, secondary: 200 });
  });

  it('primary collapsed: primary gets COLLAPSED_HEADER_HEIGHT, secondary fills remainder', () => {
    const result = computeSlotDisplayHeights(heights, { primary: true, secondary: false }, parentExtent);
    expect(result.primary).toBe(COLLAPSED_HEADER_HEIGHT);
    expect(result.secondary).toBe(parentExtent - COLLAPSED_HEADER_HEIGHT);
  });

  it('secondary collapsed: secondary gets COLLAPSED_HEADER_HEIGHT, primary fills remainder', () => {
    const result = computeSlotDisplayHeights(heights, { primary: false, secondary: true }, parentExtent);
    expect(result.secondary).toBe(COLLAPSED_HEADER_HEIGHT);
    expect(result.primary).toBe(parentExtent - COLLAPSED_HEADER_HEIGHT);
  });

  it('both collapsed: each slot gets exactly COLLAPSED_HEADER_HEIGHT (28px strips)', () => {
    const result = computeSlotDisplayHeights(heights, { primary: true, secondary: true }, parentExtent);
    expect(result.primary).toBe(COLLAPSED_HEADER_HEIGHT);
    expect(result.secondary).toBe(COLLAPSED_HEADER_HEIGHT);
  });

  it('COLLAPSED_HEADER_HEIGHT is 28', () => {
    expect(COLLAPSED_HEADER_HEIGHT).toBe(28);
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

// ---------------------------------------------------------------------------
// toggleSlotCollapsed — hook integration
// ---------------------------------------------------------------------------

describe('useDockSlotHeights — toggleSlotCollapsed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initially returns both slots not collapsed', () => {
    const { result } = renderHook(() => useDockSlotHeights());
    expect(result.current.slotsCollapsed).toEqual({ primary: false, secondary: false });
  });

  it('toggling primary sets primary collapsed to true and persists', () => {
    const { result } = renderHook(() => useDockSlotHeights());
    act(() => {
      result.current.toggleSlotCollapsed('primary');
    });
    expect(result.current.slotsCollapsed.primary).toBe(true);
    expect(result.current.slotsCollapsed.secondary).toBe(false);
    const stored = JSON.parse(
      localStorage.getItem('agent-ide:dock-persistence') ?? '{}',
    ) as Record<string, unknown>;
    expect((stored.terminalDockSlotsCollapsed as Record<string, boolean>).primary).toBe(true);
  });

  it('toggling primary twice returns primary to expanded', () => {
    const { result } = renderHook(() => useDockSlotHeights());
    act(() => {
      result.current.toggleSlotCollapsed('primary');
    });
    act(() => {
      result.current.toggleSlotCollapsed('primary');
    });
    expect(result.current.slotsCollapsed.primary).toBe(false);
  });

  it('toggling secondary does not affect primary collapsed state', () => {
    const { result } = renderHook(() => useDockSlotHeights());
    act(() => {
      result.current.toggleSlotCollapsed('secondary');
    });
    expect(result.current.slotsCollapsed.secondary).toBe(true);
    expect(result.current.slotsCollapsed.primary).toBe(false);
  });
});
