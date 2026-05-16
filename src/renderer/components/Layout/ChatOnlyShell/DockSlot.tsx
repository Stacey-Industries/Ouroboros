/**
 * DockSlot.tsx — Wave 89 Phase 1
 *
 * A single slot in the two-slot stacked terminal dock. Each slot owns its own
 * useTerminalSessions instance (independent session lifecycle). The parent
 * ChatWorkbenchTerminalDock allocates vertical space and owns the divider drag.
 *
 * slot: 'primary' — top slot; Wave 90 home for interactive claude.
 * slot: 'secondary' — bottom slot; dev shell.
 */

import React, { useCallback, useEffect } from 'react';

import { useTerminalSessions } from '../../../hooks/useTerminalSessions';
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
  activeSessionId: string | null;
  isRecording: boolean;
  onSpawn: () => void;
  onCloseSession: () => void;
  onToggleRecording: () => void;
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

function SlotHeader({
  label,
  activeSessionId,
  isRecording,
  onSpawn,
  onCloseSession,
  onToggleRecording,
}: SlotHeaderProps): React.ReactElement {
  const testId = label.toLowerCase();
  return (
    <div className="flex items-center justify-between border-b border-border-semantic px-2 py-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <SlotSpawnButton onSpawn={onSpawn} testId={testId} />
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

function useSlotHandlers(terminal: ReturnType<typeof useTerminalSessions>): SlotHandlers {
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
  terminal: ReturnType<typeof useTerminalSessions>;
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
  onActiveSessionChange?: (sessionId: string | null) => void;
}

export function DockSlot({
  slot,
  height,
  onActiveSessionChange,
}: DockSlotProps): React.ReactElement {
  const terminal = useTerminalSessions();
  const label = slot === 'primary' ? 'Primary' : 'Shell';
  const { handleSpawn, handleCloseSession, handleToggleRecording, isRecording } =
    useSlotHandlers(terminal);

  useEffect(() => {
    onActiveSessionChange?.(terminal.activeSessionId);
  }, [terminal.activeSessionId, onActiveSessionChange]);

  return (
    <div
      className="flex flex-col overflow-hidden border-b border-border-semantic"
      style={{ height }}
      data-testid={`dock-slot-${slot}`}
    >
      <SlotHeader
        label={label}
        activeSessionId={terminal.activeSessionId}
        isRecording={isRecording}
        onSpawn={handleSpawn}
        onCloseSession={handleCloseSession}
        onToggleRecording={handleToggleRecording}
      />
      <SlotTerminalSurface slot={slot} terminal={terminal} handleSpawn={handleSpawn} />
    </div>
  );
}
