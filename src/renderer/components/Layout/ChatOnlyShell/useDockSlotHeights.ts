/**
 * useDockSlotHeights — Wave 89 Phase 1
 *
 * Manages persisted heights for the two stacked terminal slots (primary / secondary)
 * in ChatWorkbenchTerminalDock. Heights are stored via dockPersistenceSchema's
 * terminalDockSlots key, separate from the IDE-panel PanelSizes.
 *
 * Sibling-resize drag uses direct pointermove/pointerup listeners (same pattern as
 * useResizable's fixed-edge mode). Sum of heights is held constant at parentExtent.
 */

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';

import type {
  DockPersistenceData,
  RawDockPersistence,
  TerminalDockSlots,
} from '../../../../shared/config/dockPersistenceSchema';
import {
  DEFAULT_TERMINAL_DOCK_SLOTS,
  migrateDockPersistence,
} from '../../../../shared/config/dockPersistenceSchema';

export const SLOT_MIN_HEIGHT = 60;
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
// Preview line (singleton, same pattern as useResizable)
// ---------------------------------------------------------------------------

const PREVIEW_LINE_ID = 'dock-slot-preview-line';

export function showSlotPreviewLine(clientY: number): void {
  let el = document.getElementById(PREVIEW_LINE_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = PREVIEW_LINE_ID;
    el.style.cssText =
      'position:fixed;z-index:9999;pointer-events:none;display:none;' +
      'background:var(--interactive-accent,#58a6ff);opacity:0.6;' +
      'left:0;right:0;height:2px;transition:none;';
    document.body.appendChild(el);
  }
  el.style.top = `${clientY}px`;
  el.style.display = 'block';
}

export function hideSlotPreviewLine(): void {
  const el = document.getElementById(PREVIEW_LINE_ID);
  if (el) el.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Clamp helper (exported for unit tests)
// ---------------------------------------------------------------------------

export function clampSlotDelta(
  delta: number,
  startPrimary: number,
  startSecondary: number,
): number {
  const maxUp = -(startPrimary - SLOT_MIN_HEIGHT);
  const maxDown = startSecondary - SLOT_MIN_HEIGHT;
  return Math.max(maxUp, Math.min(maxDown, delta));
}

// ---------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------

interface LiveDragState {
  startY: number;
  startPrimary: number;
  startSecondary: number;
  parentExtent: number;
  livePrimary: number;
  liveSecondary: number;
}

// ---------------------------------------------------------------------------
// Shared drag utilities (non-hook helpers)
// ---------------------------------------------------------------------------

function attachDragListeners(onMove: (e: PointerEvent) => void, onUp: () => void): void {
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

function detachDragListeners(onMove: (e: PointerEvent) => void, onUp: () => void): void {
  document.removeEventListener('pointermove', onMove);
  document.removeEventListener('pointerup', onUp);
  document.removeEventListener('pointercancel', onUp);
}

function resetDragCursor(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

// ---------------------------------------------------------------------------
// Move / up handlers as refs (avoids useCallback-on-factory ESLint warnings)
// ---------------------------------------------------------------------------

function useDragHandlers(
  dragRef: MutableRefObject<LiveDragState | null>,
  onCommit: (p: number, s: number) => void,
): { onMove: (e: PointerEvent) => void; onUp: () => void } {
  const onMoveRef = useRef<(e: PointerEvent) => void>(null!);
  const onUpRef = useRef<() => void>(null!);

  onMoveRef.current = (event: PointerEvent): void => {
    const state = dragRef.current;
    if (!state) return;
    const clamped = clampSlotDelta(
      event.clientY - state.startY,
      state.startPrimary,
      state.startSecondary,
    );
    state.livePrimary = state.startPrimary + clamped;
    state.liveSecondary = state.parentExtent - state.livePrimary;
    showSlotPreviewLine(event.clientY);
  };

  onUpRef.current = (): void => {
    hideSlotPreviewLine();
    const state = dragRef.current;
    if (state) onCommit(state.livePrimary, state.liveSecondary);
    dragRef.current = null;
    resetDragCursor();
    detachDragListeners(onMoveRef.current, onUpRef.current);
  };

  // Stable wrapper refs so addEventListener/removeEventListener always target the same identity
  const stableMove = useRef((e: PointerEvent) => onMoveRef.current(e)).current;
  const stableUp = useRef(() => onUpRef.current()).current;

  return { onMove: stableMove, onUp: stableUp };
}

// ---------------------------------------------------------------------------
// Drag sub-hook (kept ≤40 lines by extracting useDragHandlers above)
// ---------------------------------------------------------------------------

type StartDrag = (event: React.PointerEvent<HTMLDivElement>, parentExtent: number) => void;

function useDividerDrag(
  slotHeights: TerminalDockSlots,
  onCommit: (p: number, s: number) => void,
): StartDrag {
  const dragRef = useRef<LiveDragState | null>(null);
  const { onMove, onUp } = useDragHandlers(dragRef, onCommit);

  useEffect(() => {
    return () => {
      dragRef.current = null;
      hideSlotPreviewLine();
      resetDragCursor();
      detachDragListeners(onMove, onUp);
    };
  }, [onMove, onUp]);

  return useCallback(
    (event: React.PointerEvent<HTMLDivElement>, parentExtent: number) => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      dragRef.current = {
        startY: event.clientY,
        startPrimary: slotHeights.primary,
        startSecondary: slotHeights.secondary,
        parentExtent,
        livePrimary: slotHeights.primary,
        liveSecondary: slotHeights.secondary,
      };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      attachDragListeners(onMove, onUp);
    },
    [slotHeights, onMove, onUp],
  );
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export interface UseDockSlotHeightsReturn {
  slotHeights: TerminalDockSlots;
  startSlotDividerDrag: (event: React.PointerEvent<HTMLDivElement>, parentExtent: number) => void;
}

export function useDockSlotHeights(): UseDockSlotHeightsReturn {
  const [slotHeights, setSlotHeights] = useState<TerminalDockSlots>(loadSlotHeights);

  const onCommit = useCallback((primary: number, secondary: number) => {
    const committed: TerminalDockSlots = { primary, secondary };
    setSlotHeights(committed);
    saveSlotHeights(committed);
  }, []);

  const startSlotDividerDrag = useDividerDrag(slotHeights, onCommit);
  return { slotHeights, startSlotDividerDrag };
}
