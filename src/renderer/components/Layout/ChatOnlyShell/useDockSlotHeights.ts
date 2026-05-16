/**
 * useDockSlotHeights — Wave 89 Phase 1 (revised per Phase 1 review)
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
 */

import { useCallback, useState } from 'react';

import type {
  DockPersistenceData,
  RawDockPersistence,
  TerminalDockSlots,
} from '../../../../shared/config/dockPersistenceSchema';
import {
  DEFAULT_TERMINAL_DOCK_SLOTS,
  migrateDockPersistence,
} from '../../../../shared/config/dockPersistenceSchema';
import type { SiblingResizeOpts } from '../useResizable.sibling';

const PERSIST_KEY = 'agent-ide:dock-persistence';

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

export function saveSlotHeights(slots: TerminalDockSlots): void {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    const existing: RawDockPersistence = raw ? (JSON.parse(raw) as RawDockPersistence) : {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dockHeight: _legacy, ...rest } = existing; // drop legacy key (ADR #5)
    const next: DockPersistenceData = {
      terminalDockSlots: slots,
      overlayDrawerWidth: rest.overlayDrawerWidth ?? 380,
      artifactOverlayWidth: rest.artifactOverlayWidth ?? 480,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined' && window.electronAPI?.config?.set) {
      window.electronAPI.config.set('dockPersistence', next).catch(() => {
        // Non-critical.
      });
    }
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export interface UseDockSlotHeightsReturn {
  slotHeights: TerminalDockSlots;
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

  const onCommit = useCallback(([primary, secondary]: [number, number]) => {
    const committed: TerminalDockSlots = { primary, secondary };
    setSlotHeights(committed);
    saveSlotHeights(committed);
  }, []);

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

  return { slotHeights, buildSiblingOpts };
}
