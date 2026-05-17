/**
 * useDockSlotHeights — Wave 89 Phase 1 (revised per Phase 1 review)
 * Wave 89 Phase 4c: adds per-slot collapsed state + sibling-height computation.
 *
 * Thin persistence orchestration for the two stacked terminal slots in
 * ChatWorkbenchTerminalDock. Heights are stored via dockPersistenceSchema's
 * `terminalDockSlots` key, separate from the IDE-panel PanelSizes.
 *
 * ADR Decision 1 compliance: sibling-resize drag is fully delegated to
 * `useResizable.startSiblingResize`. This hook contains NO bespoke drag math,
 * preview-line DOM manipulation, or pointer listeners — those live exclusively
 * in useResizable / useResizable.sibling.ts.
 *
 * The `onCommit` extension added to SiblingResizeOpts (additive, non-breaking)
 * routes the committed sizes here instead of into PanelSizes, so persistence
 * writes go to the correct `terminalDockSlots` electron-store key.
 *
 * Phase 4c: collapsed state per slot. When a slot is collapsed its visible
 * height becomes COLLAPSED_HEADER_HEIGHT (28px); the sibling grows to fill.
 * Both can be collapsed simultaneously — caller gets two 28px strips.
 */

import { useCallback, useState } from 'react';

import type {
  DockPersistenceData,
  RawDockPersistence,
  TerminalDockSlots,
  TerminalDockSlotsCollapsed,
} from '../../../../shared/config/dockPersistenceSchema';
import {
  DEFAULT_TERMINAL_DOCK_SLOTS,
  DEFAULT_TERMINAL_DOCK_SLOTS_COLLAPSED,
  migrateDockPersistence,
} from '../../../../shared/config/dockPersistenceSchema';
import type { SiblingResizeOpts } from '../useResizable.sibling';

const PERSIST_KEY = 'agent-ide:dock-persistence';

/** Height of a collapsed slot header strip (px). */
export const COLLAPSED_HEADER_HEIGHT = 28;

// ---------------------------------------------------------------------------
// Persistence helpers (exported for tests)
// ---------------------------------------------------------------------------

export function loadSlotHeights(): TerminalDockSlots {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RawDockPersistence;
      const { data } = migrateDockPersistence(parsed);
      return data.terminalDockSlots;
    }
  } catch {
    // ignore — fall through to defaults
  }
  return { ...DEFAULT_TERMINAL_DOCK_SLOTS };
}

export function loadSlotsCollapsed(): TerminalDockSlotsCollapsed {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RawDockPersistence;
      const { data } = migrateDockPersistence(parsed);
      return data.terminalDockSlotsCollapsed;
    }
  } catch {
    // ignore — fall through to defaults
  }
  return { ...DEFAULT_TERMINAL_DOCK_SLOTS_COLLAPSED };
}

function buildPersistencePayload(
  slots: TerminalDockSlots,
  collapsed: TerminalDockSlotsCollapsed,
  existing: RawDockPersistence,
): DockPersistenceData {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dockHeight: _legacy, ...rest } = existing; // drop legacy key (ADR #5)
  return {
    terminalDockSlots: slots,
    terminalDockSlotsCollapsed: collapsed,
    overlayDrawerWidth: rest.overlayDrawerWidth ?? 380,
    artifactOverlayWidth: rest.artifactOverlayWidth ?? 480,
  };
}

function writeToStorage(next: DockPersistenceData): void {
  localStorage.setItem(PERSIST_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined' && window.electronAPI?.config?.set) {
    window.electronAPI.config.set('dockPersistence', next).catch(() => {
      // Non-critical.
    });
  }
}

export function saveSlotHeights(slots: TerminalDockSlots): void {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    const existing: RawDockPersistence = raw ? (JSON.parse(raw) as RawDockPersistence) : {};
    const collapsed =
      existing.terminalDockSlotsCollapsed ?? { ...DEFAULT_TERMINAL_DOCK_SLOTS_COLLAPSED };
    writeToStorage(buildPersistencePayload(slots, collapsed, existing));
  } catch {
    // ignore storage errors
  }
}

export function saveSlotsCollapsed(collapsed: TerminalDockSlotsCollapsed): void {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    const existing: RawDockPersistence = raw ? (JSON.parse(raw) as RawDockPersistence) : {};
    const slots = existing.terminalDockSlots ?? { ...DEFAULT_TERMINAL_DOCK_SLOTS };
    writeToStorage(buildPersistencePayload(slots, collapsed, existing));
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Sibling height computation
// ---------------------------------------------------------------------------

/**
 * Compute the effective display heights for both slots given the parent extent
 * and per-slot collapsed state. When a slot is collapsed it occupies
 * COLLAPSED_HEADER_HEIGHT; the sibling grows to fill the remainder.
 */
export function computeSlotDisplayHeights(
  slotHeights: TerminalDockSlots,
  collapsed: TerminalDockSlotsCollapsed,
  parentExtent: number,
): TerminalDockSlots {
  const bothCollapsed = collapsed.primary && collapsed.secondary;
  if (bothCollapsed) {
    return { primary: COLLAPSED_HEADER_HEIGHT, secondary: COLLAPSED_HEADER_HEIGHT };
  }
  if (collapsed.primary) {
    return {
      primary: COLLAPSED_HEADER_HEIGHT,
      secondary: parentExtent - COLLAPSED_HEADER_HEIGHT,
    };
  }
  if (collapsed.secondary) {
    return {
      primary: parentExtent - COLLAPSED_HEADER_HEIGHT,
      secondary: COLLAPSED_HEADER_HEIGHT,
    };
  }
  return slotHeights;
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export interface UseDockSlotHeightsReturn {
  slotHeights: TerminalDockSlots;
  slotsCollapsed: TerminalDockSlotsCollapsed;
  toggleSlotCollapsed: (slot: keyof TerminalDockSlotsCollapsed) => void;
  /**
   * Returns SiblingResizeOpts for the current slot state. The caller passes
   * these directly to `startSiblingResize` from `useResizable`. The `onCommit`
   * callback routes committed sizes to `saveSlotHeights` instead of PanelSizes.
   *
   * @param parentExtent - total interior height available to both slots (px).
   * @param startPos     - clientY at the moment the pointer went down.
   */
  buildSiblingOpts: (parentExtent: number, startPos: number) => SiblingResizeOpts;
}

export function useDockSlotHeights(): UseDockSlotHeightsReturn {
  const [slotHeights, setSlotHeights] = useState<TerminalDockSlots>(loadSlotHeights);
  const [slotsCollapsed, setSlotsCollapsed] =
    useState<TerminalDockSlotsCollapsed>(loadSlotsCollapsed);

  const onCommit = useCallback(([primary, secondary]: [number, number]) => {
    const committed: TerminalDockSlots = { primary, secondary };
    setSlotHeights(committed);
    saveSlotHeights(committed);
  }, []);

  const toggleSlotCollapsed = useCallback(
    (slot: keyof TerminalDockSlotsCollapsed) => {
      setSlotsCollapsed((prev) => {
        const next = { ...prev, [slot]: !prev[slot] };
        saveSlotsCollapsed(next);
        return next;
      });
    },
    [],
  );

  const buildSiblingOpts = useCallback(
    (parentExtent: number, startPos: number): SiblingResizeOpts => ({
      // topPanel/bottomPanel are required by SiblingResizeOpts but are only
      // used by the default PanelSizes commit path. Because onCommit is
      // provided, commitSiblingDrag returns early before reading these fields.
      // We supply valid PanelId values to satisfy the type contract.
      topPanel: 'leftSidebar',
      bottomPanel: 'rightSidebar',
      parentExtent,
      startSizes: [slotHeights.primary, slotHeights.secondary],
      startPos,
      direction: 'vertical',
      onCommit,
    }),
    [slotHeights, onCommit],
  );

  return { slotHeights, slotsCollapsed, toggleSlotCollapsed, buildSiblingOpts };
}
