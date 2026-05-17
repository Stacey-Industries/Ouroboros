/**
 * ChatWorkbenchTerminalDock — Wave 89 Phase 1 refactor.
 *
 * Two-slot stacked dock replacing the single-terminal dock from Wave 46/88.
 * - Top slot ('primary'): Wave 90 home for interactive claude; generic terminal here.
 * - Bottom slot ('secondary'): dev shell.
 * - Sibling-resizable horizontal divider between slots (useDockSlotHeights).
 * - Dock-as-whole still resizes against the body top edge via the existing
 *   fixed-edge useResizable mode (unchanged from Wave 88).
 * - Both slot heights persist via dockPersistenceSchema's terminalDockSlots key.
 *
 * Walking-skeleton commit 1: two slots mount, basic headers, no divider drag yet.
 * Commit 2 adds: divider drag + persistence wired.
 * Commit 3 adds: per-slot DockHeaderActions controls.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useResizable } from '../useResizable';
import { DockSlot } from './DockSlot';
import { useDockSlotHeights } from './useDockSlotHeights';

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
// Dock-wide header (title + close button)
// ---------------------------------------------------------------------------

function DockCloseButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className="rounded px-2 py-0.5 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
      onClick={onClose}
      data-testid="chat-workbench-dock-close"
      aria-label="Close terminal dock"
    >
      ✕
    </button>
  );
}

function DockHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-border-semantic px-3 py-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Terminal
      </div>
      <DockCloseButton onClose={onClose} />
    </div>
  );
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
  onClose: () => void;
  /** Called whenever the active dock session changes (for tool bridge). */
  onActiveSessionChange?: (sessionId: string | null) => void;
}

// ---------------------------------------------------------------------------
// useDockState — all hook wiring extracted so ChatWorkbenchTerminalDock ≤40 lines
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// useDockState — all hook wiring extracted so ChatWorkbenchTerminalDock ≤40 lines
//
// Wave 89 Phase 4b: DockResizeHandle removed (no chat sibling to resize against;
// the dock now fills the full main area via flex-1). sizes / startResize /
// handleDockResizePointerDown are no longer needed here.
// ---------------------------------------------------------------------------

interface DockState {
  slotHeights: ReturnType<typeof useDockSlotHeights>['slotHeights'];
  handleDividerPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPrimarySessionChange: (id: string | null) => void;
  onSecondarySessionChange: (id: string | null) => void;
}

function useDockState(onActiveSessionChange?: (id: string | null) => void): DockState {
  const { sizes, startSiblingResize, applySizes } = useResizable();
  const { slotHeights, buildSiblingOpts } = useDockSlotHeights();
  const { primarySessionId, secondarySessionId, onPrimarySessionChange, onSecondarySessionChange } =
    useActiveSlotSession();

  useEffect(() => {
    onActiveSessionChange?.(primarySessionId ?? secondarySessionId);
  }, [primarySessionId, secondarySessionId, onActiveSessionChange]);

  const migrationRef = useRef({ sizes, applySizes });
  useEffect(() => {
    runLegacyDockHeightMigration(migrationRef.current.sizes, migrationRef.current.applySizes);
  }, []);

  const handleDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      startSiblingResize(buildSiblingOpts(sizes.terminal, event.clientY));
    },
    [sizes.terminal, startSiblingResize, buildSiblingOpts],
  );

  return {
    slotHeights,
    handleDividerPointerDown,
    onPrimarySessionChange,
    onSecondarySessionChange,
  };
}

// ---------------------------------------------------------------------------
// ChatWorkbenchTerminalDock
// ---------------------------------------------------------------------------

export function ChatWorkbenchTerminalDock({
  onClose,
  onActiveSessionChange,
}: ChatWorkbenchTerminalDockProps): React.ReactElement {
  const { slotHeights, handleDividerPointerDown, onPrimarySessionChange, onSecondarySessionChange } =
    useDockState(onActiveSessionChange);

  return (
    // flex-1: dock fills the full dock-main-area height (Phase 4b terminal-first pivot).
    // The dock-as-whole resize handle is removed — no chat sibling exists to resize against.
    <section
      className="flex flex-1 flex-col border-t border-border-semantic bg-surface-panel/95"
      data-testid="chat-workbench-terminal-dock"
    >
      <DockHeader onClose={onClose} />
      <DockSlot
        slot="primary"
        height={slotHeights.primary}
        onActiveSessionChange={onPrimarySessionChange}
      />
      <SlotDivider onPointerDown={handleDividerPointerDown} />
      <DockSlot
        slot="secondary"
        height={slotHeights.secondary}
        onActiveSessionChange={onSecondarySessionChange}
      />
    </section>
  );
}
