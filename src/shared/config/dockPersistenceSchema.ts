/**
 * dockPersistenceSchema.ts — Wave 89 Phase 0
 *
 * Typed schema fragments and forward-migration logic for the ChatOnlyShell
 * terminal dock and overlay drawer layout persistence.
 *
 * These values are stored in electron-store (main process) and mirrored to
 * localStorage in the renderer. They are consumed by:
 *   - ChatWorkbenchTerminalDock (Phase 1) — terminalDockSlots
 *   - OverlayDrawer instances (Phase 3)  — overlayDrawerWidth, artifactOverlayWidth
 *
 * ## Defaults
 *   terminalDockSlots  = { primary: 200, secondary: 140 }
 *   overlayDrawerWidth  = 380   (utility drawer — approvals / review / monitor)
 *   artifactOverlayWidth = 480  (artifact pane — wider for content-review surface)
 *
 * ## Forward migration from legacy `dockHeight`
 * Wave 88 persisted a single `dockHeight` number. On first read post-Wave-89
 * upgrade, `migrateDockPersistence` seeds the slot heights from a 60/40 split
 * of the legacy value, then drops the legacy key on the next write.
 * No backwards migration — downgrade resets to defaults (acceptable per ADR #5).
 */

/** Per-slot terminal dock heights (px). */
export interface TerminalDockSlots {
  /** Top slot — Wave 90 home for interactive claude; generic terminal in Wave 89. */
  primary: number;
  /** Bottom slot — dev shell. */
  secondary: number;
}

/** All persisted dock/overlay layout values added in Wave 89. */
export interface DockPersistenceData {
  terminalDockSlots: TerminalDockSlots;
  overlayDrawerWidth: number;
  artifactOverlayWidth: number;
}

/** Shape of the raw persisted object before migration (may include legacy key). */
export interface RawDockPersistence extends Partial<DockPersistenceData> {
  /** Legacy Wave 88 key. Absent after first Wave-89 write. */
  dockHeight?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// Wave 89 Phase 4b: dock now fills the full shell height (flex-1) rather than
// a fixed 280px bottom strip. Defaults are tuned for a full-height dock
// (~600–800px typical). 60/40 split: primary gets the larger share as the
// Wave 90 interactive-claude home.
export const DEFAULT_TERMINAL_DOCK_SLOTS: TerminalDockSlots = {
  primary: 280,
  secondary: 180,
};

export const DEFAULT_OVERLAY_DRAWER_WIDTH = 380;
export const DEFAULT_ARTIFACT_OVERLAY_WIDTH = 480;

export const DOCK_PERSISTENCE_DEFAULTS: DockPersistenceData = {
  terminalDockSlots: DEFAULT_TERMINAL_DOCK_SLOTS,
  overlayDrawerWidth: DEFAULT_OVERLAY_DRAWER_WIDTH,
  artifactOverlayWidth: DEFAULT_ARTIFACT_OVERLAY_WIDTH,
};

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Compute the Wave-89 slot heights from a legacy `dockHeight` value.
 * primary = round(dockHeight * 0.6), secondary = dockHeight - primary.
 */
export function slotSplitFromLegacyHeight(dockHeight: number): TerminalDockSlots {
  const primary = Math.round(dockHeight * 0.6);
  return { primary, secondary: dockHeight - primary };
}

/**
 * Migrate raw persisted data to the Wave-89 schema.
 *
 * Rules (per ADR Decision 5):
 *  1. If both new keys AND legacy key are present → new keys win, legacy dropped.
 *  2. If legacy key is present and new slots are absent → seed slots from 60/40
 *     split; use defaults for drawer widths; mark legacy for removal.
 *  3. If neither is present → apply all defaults.
 *
 * Returns:
 *  - `data`        — the fully-resolved DockPersistenceData to use.
 *  - `legacyDropped` — true when `dockHeight` was present and should be removed
 *                      from the store on the next write.
 */
export function migrateDockPersistence(raw: RawDockPersistence): {
  data: DockPersistenceData;
  legacyDropped: boolean;
} {
  const hasLegacy = typeof raw.dockHeight === 'number';
  const hasSlots = raw.terminalDockSlots !== undefined;

  let terminalDockSlots: TerminalDockSlots;

  if (hasSlots) {
    // New key present — use it regardless of whether legacy is also present.
    terminalDockSlots = raw.terminalDockSlots as TerminalDockSlots;
  } else if (hasLegacy) {
    // Legacy present, new absent — derive from legacy.
    terminalDockSlots = slotSplitFromLegacyHeight(raw.dockHeight as number);
  } else {
    terminalDockSlots = { ...DEFAULT_TERMINAL_DOCK_SLOTS };
  }

  const data: DockPersistenceData = {
    terminalDockSlots,
    overlayDrawerWidth: raw.overlayDrawerWidth ?? DEFAULT_OVERLAY_DRAWER_WIDTH,
    artifactOverlayWidth: raw.artifactOverlayWidth ?? DEFAULT_ARTIFACT_OVERLAY_WIDTH,
  };

  return { data, legacyDropped: hasLegacy };
}
