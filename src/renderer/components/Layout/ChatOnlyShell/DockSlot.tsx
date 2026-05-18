/**
 * DockSlot.tsx — Wave 89 Phase 1
 * Wave 89 Phase 4c: per-slot minimize/expand affordance in SlotHeader.
 *
 * A single slot in the two-slot stacked terminal dock. Each slot owns its own
 * useTerminalSessions instance (independent session lifecycle). The parent
 * ChatWorkbenchTerminalDock allocates vertical space and owns the divider drag.
 *
 * slot: 'primary' — top slot; Wave 90 home for interactive claude.
 * slot: 'secondary' — bottom slot; dev shell.
 *
 * Phase 4c collapse behavior:
 *  - When collapsed=true the slot renders only its SlotHeader (28px strip).
 *  - The ▾ button collapses, ▴ expands.
 *  - + New button stays visible when collapsed (user can spawn while collapsed).
 *  - Rec and ✕ buttons hide when collapsed (need visible terminal surface).
 */

import React, { useCallback, useEffect } from 'react';

import type { SlotHandle } from '../../../contexts/ProjectTerminalsContext';
import { useProjectTerminalsContext } from '../../../contexts/ProjectTerminalsContext';
import { ErrorBoundary } from '../../shared/ErrorBoundary';
import { TerminalManager } from '../../Terminal/TerminalManager';

export type SlotId = 'primary' | 'secondary';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BTN_BASE = 'rounded px-2 py-0.5 text-xs text-text-semantic-secondary transition-colors';
const BTN_HOVER = 'hover:bg-surface-hover hover:text-text-semantic-primary';
const BTN_DANGER =
  'hover:bg-surface-hover hover:text-status-error disabled:opacity-40 ' +
  'disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-semantic-secondary';

// ---------------------------------------------------------------------------
// Slot header sub-components (extracted to stay under 40-line limit)
// ---------------------------------------------------------------------------

interface SlotHeaderProps {
  label: string;
  collapsed: boolean;
  activeSessionId: string | null;
  isRecording: boolean;
  onSpawn: () => void;
  onCloseSession: () => void;
  onToggleRecording: () => void;
  onToggleCollapse: () => void;
}

function SlotCollapseButton({
  collapsed,
  onToggleCollapse,
}: Pick<SlotHeaderProps, 'collapsed' | 'onToggleCollapse'>): React.ReactElement {
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
}: Pick<
  SlotHeaderProps,
  'activeSessionId' | 'isRecording' | 'onToggleRecording'
>): React.ReactElement {
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

function SlotExpandedButtons({
  testId,
  activeSessionId,
  isRecording,
  onCloseSession,
  onToggleRecording,
}: {
  testId: string;
  activeSessionId: string | null;
  isRecording: boolean;
  onCloseSession: () => void;
  onToggleRecording: () => void;
}): React.ReactElement {
  return (
    <>
      <SlotRecordingButton
        activeSessionId={activeSessionId}
        isRecording={isRecording}
        onToggleRecording={onToggleRecording}
      />
      <button
        type="button"
        disabled={!activeSessionId}
        className={`${BTN_BASE} ${BTN_DANGER}`}
        onClick={onCloseSession}
        data-testid={`dock-slot-${testId}-close-session`}
        aria-label="Close session"
      >
        ✕
      </button>
    </>
  );
}

function SlotHeader({
  label,
  collapsed,
  activeSessionId,
  isRecording,
  onSpawn,
  onCloseSession,
  onToggleRecording,
  onToggleCollapse,
}: SlotHeaderProps): React.ReactElement {
  const testId = label.toLowerCase();
  return (
    <div
      className="flex shrink-0 items-center justify-between border-b border-border-semantic px-2 py-0.5"
      style={{ height: 28 }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <SlotSpawnButton onSpawn={onSpawn} testId={testId} />
        {!collapsed && (
          <SlotExpandedButtons
            testId={testId}
            activeSessionId={activeSessionId}
            isRecording={isRecording}
            onCloseSession={onCloseSession}
            onToggleRecording={onToggleRecording}
          />
        )}
        <SlotCollapseButton collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DockSlot hook (extracted to keep DockSlot component under 40 lines)
// ---------------------------------------------------------------------------

interface SlotHandlers {
  handleSpawn: () => void;
  handleCloseSession: () => void;
  handleToggleRecording: () => void;
  isRecording: boolean;
}

function useSlotHandlers(terminal: SlotHandle): SlotHandlers {
  const handleSpawn = useCallback(() => {
    void terminal.spawnSession();
  }, [terminal]);
  const handleCloseSession = useCallback(() => {
    if (terminal.activeSessionId) terminal.handleTerminalClose(terminal.activeSessionId);
  }, [terminal]);
  const handleToggleRecording = useCallback(() => {
    if (terminal.activeSessionId) void terminal.handleToggleRecording(terminal.activeSessionId);
  }, [terminal]);
  const isRecording = Boolean(
    terminal.activeSessionId && terminal.recordingSessions.has(terminal.activeSessionId),
  );
  return { handleSpawn, handleCloseSession, handleToggleRecording, isRecording };
}

// ---------------------------------------------------------------------------
// SlotTerminalSurface (extracted to keep DockSlot under 40 lines)
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
  const label = slot === 'primary' ? 'Primary' : 'Shell';
  const { handleSpawn, handleCloseSession, handleToggleRecording, isRecording } =
    useSlotHandlers(terminal);

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
      <SlotHeader
        label={label}
        collapsed={collapsed}
        activeSessionId={terminal.activeSessionId}
        isRecording={isRecording}
        onSpawn={handleSpawn}
        onCloseSession={handleCloseSession}
        onToggleRecording={handleToggleRecording}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <SlotTerminalSurface slot={slot} terminal={terminal} handleSpawn={handleSpawn} />
      )}
    </div>
  );
}
