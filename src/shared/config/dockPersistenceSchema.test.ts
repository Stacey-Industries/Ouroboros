/**
 * dockPersistenceSchema.test.ts — Wave 89 Phase 0
 *
 * Unit tests for the migration logic and defaults in dockPersistenceSchema.ts.
 * Pyramid-tier: pure functions, no I/O, no React.
 *
 * Contracts verified:
 *  - migrateDockPersistence: legacy dockHeight present, new keys absent
 *    → seeds 60/40 split from legacy, marks legacyDropped, applies drawer defaults.
 *  - migrateDockPersistence: legacy absent, new keys absent
 *    → applies all defaults, legacyDropped is false.
 *  - migrateDockPersistence: both legacy and new keys present
 *    → new keys win, legacy is dropped (legacyDropped true).
 *  - slotSplitFromLegacyHeight: correct 60/40 split with rounding.
 *  - Default constant values match the ADR-specified values.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARTIFACT_OVERLAY_WIDTH,
  DEFAULT_OVERLAY_DRAWER_WIDTH,
  DEFAULT_TERMINAL_DOCK_SLOTS,
  migrateDockPersistence,
  slotSplitFromLegacyHeight,
} from './dockPersistenceSchema';

// ---------------------------------------------------------------------------
// Default values — verify the ADR-specified constants
// ---------------------------------------------------------------------------

describe('default constants', () => {
  it('terminalDockSlots defaults are { primary: 160, secondary: 100 } (sum fits within 280px outer dock)', () => {
    expect(DEFAULT_TERMINAL_DOCK_SLOTS).toEqual({ primary: 160, secondary: 100 });
  });

  it('overlayDrawerWidth default is 380', () => {
    expect(DEFAULT_OVERLAY_DRAWER_WIDTH).toBe(380);
  });

  it('artifactOverlayWidth default is 480', () => {
    expect(DEFAULT_ARTIFACT_OVERLAY_WIDTH).toBe(480);
  });
});

// ---------------------------------------------------------------------------
// slotSplitFromLegacyHeight
// ---------------------------------------------------------------------------

describe('slotSplitFromLegacyHeight', () => {
  it('splits 300 into primary=180, secondary=120 (60/40)', () => {
    const slots = slotSplitFromLegacyHeight(300);
    expect(slots.primary).toBe(180);
    expect(slots.secondary).toBe(120);
    expect(slots.primary + slots.secondary).toBe(300);
  });

  it('rounds primary to nearest integer and secondary is the remainder', () => {
    // 250 * 0.6 = 150.0 → primary=150, secondary=100
    const slots = slotSplitFromLegacyHeight(250);
    expect(slots.primary).toBe(150);
    expect(slots.secondary).toBe(100);
    expect(slots.primary + slots.secondary).toBe(250);
  });

  it('handles non-round splits: sum always equals the input', () => {
    // 280 * 0.6 = 168 → primary=168, secondary=112
    const slots = slotSplitFromLegacyHeight(280);
    expect(slots.primary + slots.secondary).toBe(280);
  });
});

// ---------------------------------------------------------------------------
// migrateDockPersistence — three fixture cases
// ---------------------------------------------------------------------------

describe('migrateDockPersistence', () => {
  it('case 1: legacy dockHeight present, new keys absent → seeds 60/40 split, drops legacy', () => {
    const { data, legacyDropped } = migrateDockPersistence({ dockHeight: 300 });

    expect(legacyDropped).toBe(true);
    expect(data.terminalDockSlots.primary).toBe(180);   // round(300 * 0.6)
    expect(data.terminalDockSlots.secondary).toBe(120); // 300 - 180
    expect(data.terminalDockSlots.primary + data.terminalDockSlots.secondary).toBe(300);

    // Drawer widths fall back to defaults when absent from raw data.
    expect(data.overlayDrawerWidth).toBe(DEFAULT_OVERLAY_DRAWER_WIDTH);
    expect(data.artifactOverlayWidth).toBe(DEFAULT_ARTIFACT_OVERLAY_WIDTH);
  });

  it('case 2: legacy absent, new keys absent → all defaults applied, legacyDropped false', () => {
    const { data, legacyDropped } = migrateDockPersistence({});

    expect(legacyDropped).toBe(false);
    expect(data.terminalDockSlots).toEqual(DEFAULT_TERMINAL_DOCK_SLOTS);
    expect(data.overlayDrawerWidth).toBe(DEFAULT_OVERLAY_DRAWER_WIDTH);
    expect(data.artifactOverlayWidth).toBe(DEFAULT_ARTIFACT_OVERLAY_WIDTH);
  });

  it('case 3: both legacy and new keys present → new keys win, legacy dropped', () => {
    const { data, legacyDropped } = migrateDockPersistence({
      dockHeight: 300,
      terminalDockSlots: { primary: 250, secondary: 150 },
      overlayDrawerWidth: 420,
      artifactOverlayWidth: 520,
    });

    expect(legacyDropped).toBe(true);
    // New slots win — NOT the 60/40 split from dockHeight.
    expect(data.terminalDockSlots).toEqual({ primary: 250, secondary: 150 });
    expect(data.overlayDrawerWidth).toBe(420);
    expect(data.artifactOverlayWidth).toBe(520);
  });

  it('preserves explicit overlayDrawerWidth when provided alongside legacy', () => {
    const { data } = migrateDockPersistence({
      dockHeight: 280,
      overlayDrawerWidth: 440,
    });
    expect(data.overlayDrawerWidth).toBe(440);
    expect(data.artifactOverlayWidth).toBe(DEFAULT_ARTIFACT_OVERLAY_WIDTH);
  });
});
