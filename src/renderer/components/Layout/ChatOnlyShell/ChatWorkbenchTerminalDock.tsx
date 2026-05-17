/**
 * ChatWorkbenchTerminalDock — Wave 89 Phase 1 refactor.
 * Wave 89 Phase 4c: per-slot collapse affordance; dock-wide close button removed.
 *
 * Two-slot stacked dock replacing the single-terminal dock from Wave 46/88.
 * - Top slot ('primary'): Wave 90 home for interactive claude; generic terminal here.
 * - Bottom slot ('secondary'): dev shell.
 * - Sibling-resizable horizontal divider between slots (useDockSlotHeights).
 * - Dock-as-whole still resizes against the body top edge via the existing
 *   fixed-edge useResizable mode (unchanged from Wave 88).
 * - Both slot heights persist via dockPersistenceSchema's terminalDockSlots key.
 * - Per-slot collapsed state persists via terminalDockSlotsCollapsed key.
 *
 * Phase 4c: onClose prop removed — dock is permanent in terminal-first mode.
 * DockHeader and DockCloseButton removed; per-slot ▾/▴ buttons replace them.
 * When a slot is collapsed the divider is a no-op (collapsed slot height = 28px,
 * sibling fills remainder via computeSlotDisplayHeights).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useResizable } from '../useResizable';
import { DockSlot } from './DockSlot';
import { computeSlotDisplayHeights, useDockSlotHeights } from './useDockSlotHeights';

// ---------------------------------------------------------------------------
// Legacy migration (pre-Wave-88 localStorage key — kept from Wave 88)
// ---------------------------------------------------------------------------

const LEGACY_DOCK_STORAGE_KEY = 'agent-ide:chat-workbench-terminal-dock';
const TERMINAL_DEFAULT_SIZE = 280;
const TERMINAL_MIN_SIZE = 120;
const TERMINAL_MAX_SIZE = 600;

function runLegacyDockHeightMigration(
  currentSizes: ReturnType<typeof useResizable>['sizes'],
  applySizes: ReturnType<typeof useResizable>['applySizes'],
): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LEGACY_DOCK_STORAGE_KEY);
    if (!raw) return;
    window.localStorage.removeItem(LEGACY_DOCK_STORAGE_KEY);
    const parsed = JSON.parse(raw) as { height?: unknown };
    const legacyHeight = parsed.height;
    if (
      typeof legacyHeight === 'number' &&
      Number.isFinite(legacyHeight) &&
      legacyHeight >= TERMINAL_MIN_SIZE &&
      legacyHeight <= TERMINAL_MAX_SIZE &&
      currentSizes.terminal === TERMINAL_DEFAULT_SIZE
    ) {
      applySizes({ ...currentSizes, terminal: legacyHeight });
    }
  } catch {
    try {
      window.localStorage.removeItem(LEGACY_DOCK_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Slot divider (sibling resize between primary and secondary)
// ---------------------------------------------------------------------------

function SlotDivider({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}): React.ReactElement {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize between terminal slots"
      className="h-1 shrink-0 cursor-ns-resize bg-transparent transition-colors hover:bg-interactive-accent"
      onPointerDown={onPointerDown}
      data-testid="dock-slot-divider"
    />
  );
}

// ---------------------------------------------------------------------------
// Active session tracking (for tool bridge routing)
// ---------------------------------------------------------------------------

function useActiveSlotSession(): {
  primarySessionId: string | null;
  secondarySessionId: string | null;
  onPrimarySessionChange: (id: string | null) => void;
  onSecondarySessionChange: (id: string | null) => void;
} {
  const [primarySessionId, setPrimarySessionId] = useState<string | null>(null);
  const [secondarySessionId, setSecondarySessionId] = useState<string | null>(null);
  const onPrimarySessionChange = useCallback((id: string | null) => {
    setPrimarySessionId(id);
  }, []);
  const onSecondarySessionChange = useCallback((id: string | null) => {
    setSecondarySessionId(id);
  }, []);
  return { primarySessionId, secondarySessionId, onPrimarySessionChange, onSecondarySessionChange };
}

// ---------------------------------------------------------------------------
// Public component props
// ---------------------------------------------------------------------------

export interface ChatWorkbenchTerminalDockProps {
  /** Called whenever the active dock session changes (for tool bridge). */
  onActiveSessionChange?: (sessionId: string | null) => void;
}

// ---------------------------------------------------------------------------
// useDockState — all hook wiring extracted so ChatWorkbenchTerminalDock ≤40 lines
//
// Wave 89 Phase 4b: DockResizeHandle removed (no chat sibling to resize against;
// the dock now fills the full main area via flex-1). sizes / startResize /
// handleDockResizePointerDown are no longer needed here.
// Wave 89 Phase 4c: slotsCollapsed + toggleSlotCollapsed added.
// ---------------------------------------------------------------------------

interface DockState {
  primaryHeight: number;
  secondaryHeight: number;
  primaryCollapsed: boolean;
  secondaryCollapsed: boolean;
  handleDividerPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPrimarySessionChange: (id: string | null) => void;
  onSecondarySessionChange: (id: string | null) => void;
  togglePrimaryCollapsed: () => void;
  toggleSecondaryCollapsed: () => void;
}

/** parentExtent used when no DOM measurement available (SSR / first render). */
const FALLBACK_PARENT_EXTENT = 600;

// Extracted to keep useDockState under 40 lines.
function useCollapseToggles(toggleSlotCollapsed: (slot: 'primary' | 'secondary') => void): {
  togglePrimaryCollapsed: () => void;
  toggleSecondaryCollapsed: () => void;
} {
  const togglePrimaryCollapsed = useCallback(
    () => toggleSlotCollapsed('primary'),
    [toggleSlotCollapsed],
  );
  const toggleSecondaryCollapsed = useCallback(
    () => toggleSlotCollapsed('secondary'),
    [toggleSlotCollapsed],
  );
  return { togglePrimaryCollapsed, toggleSecondaryCollapsed };
}

function useDockState(onActiveSessionChange?: (id: string | null) => void): DockState {
  const { sizes, startSiblingResize, applySizes } = useResizable();
  const { slotHeights, slotsCollapsed, toggleSlotCollapsed, buildSiblingOpts } =
    useDockSlotHeights();
  const { primarySessionId, secondarySessionId, onPrimarySessionChange, onSecondarySessionChange } =
    useActiveSlotSession();
  const { togglePrimaryCollapsed, toggleSecondaryCollapsed } =
    useCollapseToggles(toggleSlotCollapsed);

  useEffect(() => {
    onActiveSessionChange?.(primarySessionId ?? secondarySessionId);
  }, [primarySessionId, secondarySessionId, onActiveSessionChange]);

  const migrationRef = useRef({ sizes, applySizes });
  useEffect(() => {
    runLegacyDockHeightMigration(migrationRef.current.sizes, migrationRef.current.applySizes);
  }, []);

  const handleDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (slotsCollapsed.primary || slotsCollapsed.secondary) return;
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      startSiblingResize(buildSiblingOpts(sizes.terminal, event.clientY));
    },
    [sizes.terminal, startSiblingResize, buildSiblingOpts, slotsCollapsed],
  );

  const display = computeSlotDisplayHeights(
    slotHeights, slotsCollapsed, sizes.terminal || FALLBACK_PARENT_EXTENT,
  );
  return {
    primaryHeight: display.primary,
    secondaryHeight: display.secondary,
    primaryCollapsed: slotsCollapsed.primary,
    secondaryCollapsed: slotsCollapsed.secondary,
    handleDividerPointerDown,
    onPrimarySessionChange,
    onSecondarySessionChange,
    togglePrimaryCollapsed,
    toggleSecondaryCollapsed,
  };
}

// ---------------------------------------------------------------------------
// ChatWorkbenchTerminalDock
// ---------------------------------------------------------------------------

export function ChatWorkbenchTerminalDock({
  onActiveSessionChange,
}: ChatWorkbenchTerminalDockProps): React.ReactElement {
  const {
    primaryHeight,
    secondaryHeight,
    primaryCollapsed,
    secondaryCollapsed,
    handleDividerPointerDown,
    onPrimarySessionChange,
    onSecondarySessionChange,
    togglePrimaryCollapsed,
    toggleSecondaryCollapsed,
  } = useDockState(onActiveSessionChange);

  return (
    // flex-1: dock fills the full dock-main-area height (Phase 4b terminal-first pivot).
    // The dock-as-whole resize handle is removed — no chat sibling exists to resize against.
    <section
      className="flex flex-1 flex-col border-t border-border-semantic bg-surface-panel/95"
      data-testid="chat-workbench-terminal-dock"
    >
      <DockSlot
        slot="primary"
        height={primaryHeight}
        collapsed={primaryCollapsed}
        onToggleCollapse={togglePrimaryCollapsed}
        onActiveSessionChange={onPrimarySessionChange}
      />
      <SlotDivider onPointerDown={handleDividerPointerDown} />
      <DockSlot
        slot="secondary"
        height={secondaryHeight}
        collapsed={secondaryCollapsed}
        onToggleCollapse={toggleSecondaryCollapsed}
        onActiveSessionChange={onSecondarySessionChange}
      />
    </section>
  );
}
