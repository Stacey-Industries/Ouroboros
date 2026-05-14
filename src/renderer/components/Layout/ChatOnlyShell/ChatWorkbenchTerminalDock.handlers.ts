/**
 * useDockHandlers — extracted callbacks for ChatWorkbenchTerminalDock.
 *
 * Moved to a separate file in Wave 88 Phase 5 to keep the parent component
 * under the ESLint max-lines limit (300) after the parity button additions.
 */

import React, { useCallback } from 'react';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import type { useResizable } from '../useResizable';

export interface DockHandlers {
  handleCloseSession: () => void;
  handleNewClaude: () => void;
  handleNewCodex: () => void;
  handleToggleRecording: () => void;
  handleResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  isRecording: boolean;
}

export function useDockHandlers(
  terminal: UseTerminalSessionsReturn,
  sizes: ReturnType<typeof useResizable>['sizes'],
  startResize: ReturnType<typeof useResizable>['startResize'],
): DockHandlers {
  const handleCloseSession = useCallback(() => {
    if (terminal.activeSessionId) terminal.handleTerminalClose(terminal.activeSessionId);
  }, [terminal]);
  const handleNewClaude = useCallback(() => {
    void terminal.spawnClaudeSession();
  }, [terminal]);
  const handleNewCodex = useCallback(() => {
    void terminal.spawnCodexSession();
  }, [terminal]);
  const handleToggleRecording = useCallback(() => {
    if (terminal.activeSessionId) void terminal.handleToggleRecording(terminal.activeSessionId);
  }, [terminal]);
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      startResize('terminal', 'horizontal', sizes.terminal, event.clientY);
    },
    [sizes.terminal, startResize],
  );
  const isRecording = Boolean(
    terminal.activeSessionId && terminal.recordingSessions.has(terminal.activeSessionId),
  );
  return {
    handleCloseSession,
    handleNewClaude,
    handleNewCodex,
    handleToggleRecording,
    handleResizePointerDown,
    isRecording,
  };
}
