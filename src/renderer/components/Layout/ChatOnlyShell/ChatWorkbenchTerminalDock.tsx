/**
 * ChatWorkbenchTerminalDock — docked terminal surface for chat-workbench shell.
 *
 * Wave 46 Phase C: mounts the shared TerminalManager inside a resizable,
 * collapsible dock at the bottom of the workbench. Reuses the existing
 * terminal session state — no second PTY stack.
 */

import React, { useCallback, useEffect, useRef } from 'react';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { ErrorBoundary } from '../../shared/ErrorBoundary';
import { TerminalManager } from '../../Terminal/TerminalManager';
import { TERMINAL_DOCK_CONSTANTS } from './useTerminalDockState';

export interface ChatWorkbenchTerminalDockProps {
  terminal: UseTerminalSessionsReturn;
  height: number;
  onHeightChange: (px: number) => void;
  onClose: () => void;
}

interface DragController {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}

function useDockResize(height: number, onHeightChange: (px: number) => void): DragController {
  const startRef = useRef<{ clientY: number; height: number } | null>(null);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const delta = start.clientY - event.clientY;
      onHeightChange(start.height + delta);
    },
    [onHeightChange],
  );

  const endDrag = useCallback(() => {
    startRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }, [onPointerMove]);

  useEffect(() => endDrag, [endDrag]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      startRef.current = { clientY: event.clientY, height };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    },
    [endDrag, height, onPointerMove],
  );

  return { onPointerDown };
}

const DOCK_BTN_BASE = 'rounded px-2 py-0.5 text-xs text-text-semantic-secondary transition-colors';
const DOCK_BTN_HOVER = 'hover:bg-surface-hover hover:text-text-semantic-primary';
const DOCK_BTN_DANGER =
  'hover:bg-surface-hover hover:text-status-error disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-semantic-secondary';

function DockCloseButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className={`${DOCK_BTN_BASE} ${DOCK_BTN_HOVER}`}
      onClick={onClose}
      data-testid="chat-workbench-dock-close"
      aria-label="Close terminal dock"
    >
      ✕
    </button>
  );
}

function DockHeaderActions({
  onSpawn,
  onCloseSession,
  canCloseSession,
  onClose,
}: {
  onSpawn: () => void;
  onCloseSession: () => void;
  canCloseSession: boolean;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`${DOCK_BTN_BASE} ${DOCK_BTN_HOVER}`}
        onClick={onSpawn}
        data-testid="chat-workbench-dock-spawn"
      >
        + New
      </button>
      <button
        type="button"
        disabled={!canCloseSession}
        className={`${DOCK_BTN_BASE} ${DOCK_BTN_DANGER}`}
        onClick={onCloseSession}
        data-testid="chat-workbench-dock-close-session"
        aria-label="Close active terminal session"
        title="Close active terminal session"
      >
        Close session
      </button>
      <DockCloseButton onClose={onClose} />
    </div>
  );
}

function DockHeader(props: {
  onSpawn: () => void;
  onCloseSession: () => void;
  canCloseSession: boolean;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-border-semantic px-3 py-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Terminal
      </div>
      <DockHeaderActions {...props} />
    </div>
  );
}

function DockResizeHandle({ onPointerDown }: DragController): React.ReactElement {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal dock"
      className="h-1 cursor-ns-resize bg-transparent transition-colors hover:bg-interactive-accent"
      onPointerDown={onPointerDown}
      data-testid="chat-workbench-dock-resize"
    />
  );
}

function DockTerminalSurface({
  terminal,
}: {
  terminal: UseTerminalSessionsReturn;
}): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <ErrorBoundary label="ChatWorkbenchTerminal">
        <TerminalManager
          sessions={terminal.sessions}
          activeSessionId={terminal.activeSessionId}
          onRestart={terminal.handleTerminalRestart}
          onClose={terminal.handleTerminalClose}
          onTitleChange={terminal.handleTerminalTitleChange}
          onSpawn={() => void terminal.spawnSession()}
          recordingSessions={terminal.recordingSessions}
          onToggleRecording={(id) => void terminal.handleToggleRecording(id)}
          onSplit={(id) => void terminal.handleSplit(id)}
          onCloseSplit={terminal.handleCloseSplit}
        />
      </ErrorBoundary>
    </div>
  );
}

export function ChatWorkbenchTerminalDock({
  terminal,
  height,
  onHeightChange,
  onClose,
}: ChatWorkbenchTerminalDockProps): React.ReactElement {
  const drag = useDockResize(height, onHeightChange);
  const clampedHeight = Math.min(
    TERMINAL_DOCK_CONSTANTS.MAX_HEIGHT,
    Math.max(TERMINAL_DOCK_CONSTANTS.MIN_HEIGHT, height),
  );
  const handleCloseSession = useCallback(() => {
    if (terminal.activeSessionId) terminal.handleTerminalClose(terminal.activeSessionId);
  }, [terminal]);

  return (
    <section
      className="flex shrink-0 flex-col border-t border-border-semantic bg-surface-panel/95"
      style={{ height: clampedHeight }}
      data-testid="chat-workbench-terminal-dock"
    >
      <DockResizeHandle onPointerDown={drag.onPointerDown} />
      <DockHeader
        onSpawn={() => void terminal.spawnSession()}
        onCloseSession={handleCloseSession}
        canCloseSession={Boolean(terminal.activeSessionId)}
        onClose={onClose}
      />
      <DockTerminalSurface terminal={terminal} />
    </section>
  );
}
