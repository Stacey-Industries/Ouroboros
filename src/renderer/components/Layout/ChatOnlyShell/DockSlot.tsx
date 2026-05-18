/**
 * DockSlot.tsx — Wave 89 Phase 1
 * Wave 89 Phase 4c: per-slot minimize/expand affordance in SlotHeader.
 * Wave 94 Phase C: tab strip replaces label row when sessions exist (ADR Decision 5).
 *
 * slot: 'primary' — top slot; Wave 90 home for interactive claude.
 * slot: 'secondary' — bottom slot; dev shell.
 *
 * Phase 4c collapse behavior:
 *  - When collapsed=true the slot renders only its header strip (28px).
 *  - The ▾ button collapses, ▴ expands.
 *  - + New button stays visible when collapsed (user can spawn while collapsed).
 *  - Rec and ✕ buttons hide when collapsed (need visible terminal surface).
 *
 * Phase C tab strip:
 *  - sessions.length === 0 → SlotHeader with label (legacy empty state).
 *  - sessions.length > 0  → SlotTabsHeader (tab strip; label suppressed).
 */

import React, { useCallback, useEffect } from 'react';

import type { SlotHandle } from '../../../contexts/ProjectTerminalsContext';
import { useProjectTerminalsContext } from '../../../contexts/ProjectTerminalsContext';
import { ErrorBoundary } from '../../shared/ErrorBoundary';
import { TerminalManager } from '../../Terminal/TerminalManager';
import { SlotTabsHeader } from './DockSlotTabs';

export type SlotId = 'primary' | 'secondary';

// ---------------------------------------------------------------------------
// Styles (exported so DockSlotTabs can import them)
// ---------------------------------------------------------------------------

export const BTN_BASE =
  'rounded px-2 py-0.5 text-xs text-text-semantic-secondary transition-colors';
export const BTN_HOVER = 'hover:bg-surface-hover hover:text-text-semantic-primary';
export const BTN_DANGER =
  'hover:bg-surface-hover hover:text-status-error disabled:opacity-40 ' +
  'disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-semantic-secondary';

// ---------------------------------------------------------------------------
// Slot header sub-components (exported for use in DockSlotTabs)
// ---------------------------------------------------------------------------

export function SlotCollapseButton({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`${BTN_BASE} ${BTN_HOVER}`}
      onClick={onToggleCollapse}
      aria-label={collapsed ? 'Expand slot' : 'Collapse slot'}
      aria-expanded={!collapsed}
    >
      {collapsed ? '▴' : '▾'}
    </button>
  );
}

function SlotRecordingButton({
  activeSessionId,
  isRecording,
  onToggleRecording,
}: {
  activeSessionId: string | null;
  isRecording: boolean;
  onToggleRecording: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`${BTN_BASE} flex items-center gap-1 ${BTN_HOVER}`}
      onClick={onToggleRecording}
      disabled={!activeSessionId}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      aria-pressed={isRecording}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${isRecording ? 'bg-status-error' : 'bg-text-semantic-muted'}`}
        aria-hidden="true"
      />
      Rec
    </button>
  );
}

function SlotSpawnButton({
  onSpawn,
  testId,
}: {
  onSpawn: () => void;
  testId: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`${BTN_BASE} ${BTN_HOVER}`}
      onClick={onSpawn}
      data-testid={`dock-slot-${testId}-spawn`}
    >
      + New
    </button>
  );
}

export function SlotExpandedButtons({
  activeSessionId,
  isRecording,
  onToggleRecording,
}: {
  activeSessionId: string | null;
  isRecording: boolean;
  onToggleRecording: () => void;
}): React.ReactElement {
  return (
    <SlotRecordingButton
      activeSessionId={activeSessionId}
      isRecording={isRecording}
      onToggleRecording={onToggleRecording}
    />
  );
}

// ---------------------------------------------------------------------------
// SlotHeader — empty-state label row (sessions.length === 0)
// ---------------------------------------------------------------------------

interface SlotHeaderProps {
  slot: SlotId;
  collapsed: boolean;
  activeSessionId: string | null;
  isRecording: boolean;
  onSpawn: () => void;
  onToggleRecording: () => void;
  onToggleCollapse: () => void;
}

function SlotHeader({
  slot,
  collapsed,
  activeSessionId,
  isRecording,
  onSpawn,
  onToggleRecording,
  onToggleCollapse,
}: SlotHeaderProps): React.ReactElement {
  return (
    <div
      className="flex shrink-0 items-center justify-between border-b border-border-semantic px-2 py-0.5"
      style={{ height: 28 }}
    >
      <SlotSpawnButton onSpawn={onSpawn} testId={slot} />
      <div className="flex items-center gap-1">
        {!collapsed && (
          <SlotExpandedButtons
            activeSessionId={activeSessionId}
            isRecording={isRecording}
            onToggleRecording={onToggleRecording}
          />
        )}
        <SlotCollapseButton collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useSlotHandlers — callbacks for the active session
// ---------------------------------------------------------------------------

interface SlotHandlers {
  handleSpawn: () => void;
  handleToggleRecording: () => void;
  isRecording: boolean;
}

function useSlotHandlers(terminal: SlotHandle): SlotHandlers {
  const handleSpawn = useCallback(() => {
    void terminal.spawnSession();
  }, [terminal]);
  const handleToggleRecording = useCallback(() => {
    if (terminal.activeSessionId) void terminal.handleToggleRecording(terminal.activeSessionId);
  }, [terminal]);
  const isRecording = Boolean(
    terminal.activeSessionId && terminal.recordingSessions.has(terminal.activeSessionId),
  );
  return { handleSpawn, handleToggleRecording, isRecording };
}

// ---------------------------------------------------------------------------
// SlotTerminalSurface
// ---------------------------------------------------------------------------

function SlotTerminalSurface({
  slot,
  terminal,
  handleSpawn,
}: {
  slot: SlotId;
  terminal: SlotHandle;
  handleSpawn: () => void;
}): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <ErrorBoundary label={`DockSlot-${slot}`}>
        <TerminalManager
          slot={slot}
          sessions={terminal.sessions}
          activeSessionId={terminal.activeSessionId}
          onRestart={terminal.handleTerminalRestart}
          onClose={terminal.handleTerminalClose}
          onTitleChange={terminal.handleTerminalTitleChange}
          onSpawn={handleSpawn}
          recordingSessions={terminal.recordingSessions}
          onToggleRecording={(id) => void terminal.handleToggleRecording(id)}
          onSplit={(id) => void terminal.handleSplit(id)}
          onCloseSplit={terminal.handleCloseSplit}
        />
      </ErrorBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlotHeaderRow — picks tab strip vs label header based on session count
// ---------------------------------------------------------------------------

interface SlotHeaderRowProps {
  slot: SlotId;
  terminal: SlotHandle;
  collapsed: boolean;
  isRecording: boolean;
  onSpawn: () => void;
  onToggleRecording: () => void;
  onToggleCollapse: () => void;
}

function SlotHeaderRow({ terminal, ...rest }: SlotHeaderRowProps): React.ReactElement {
  if (terminal.sessions.length > 0) {
    return <SlotTabsHeader terminal={terminal} {...rest} />;
  }
  return <SlotHeader activeSessionId={terminal.activeSessionId} {...rest} />;
}

// ---------------------------------------------------------------------------
// DockSlot
// ---------------------------------------------------------------------------

export interface DockSlotProps {
  slot: SlotId;
  height: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onActiveSessionChange?: (sessionId: string | null) => void;
}

export function DockSlot({
  slot,
  height,
  collapsed,
  onToggleCollapse,
  onActiveSessionChange,
}: DockSlotProps): React.ReactElement {
  const terminals = useProjectTerminalsContext();
  const terminal = slot === 'primary' ? terminals.primary : terminals.secondary;
  const { handleSpawn, handleToggleRecording, isRecording } = useSlotHandlers(terminal);

  useEffect(() => {
    onActiveSessionChange?.(terminal.activeSessionId);
  }, [terminal.activeSessionId, onActiveSessionChange]);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height }}
      data-testid={`dock-slot-${slot}`}
      data-collapsed={collapsed}
    >
      <SlotHeaderRow
        slot={slot}
        terminal={terminal}
        collapsed={collapsed}
        isRecording={isRecording}
        onSpawn={handleSpawn}
        onToggleRecording={handleToggleRecording}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <SlotTerminalSurface slot={slot} terminal={terminal} handleSpawn={handleSpawn} />
      )}
    </div>
  );
}
