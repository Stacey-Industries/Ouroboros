/**
 * @vitest-environment jsdom
 *
 * useDockHandlers — unit tests for Wave 88 Phase 5 dock header callbacks.
 *
 * Contracts under test:
 *  - handleCloseSession calls handleTerminalClose with activeSessionId when set
 *  - handleCloseSession is a no-op when activeSessionId is null
 *  - handleNewClaude calls spawnClaudeSession
 *  - handleNewCodex calls spawnCodexSession
 *  - handleToggleRecording calls handleToggleRecording with activeSessionId when set
 *  - handleToggleRecording is a no-op when activeSessionId is null
 *  - isRecording is true when activeSessionId is in recordingSessions
 *  - isRecording is false when activeSessionId is absent from recordingSessions
 *  - isRecording is false when activeSessionId is null
 *  - handleResizePointerDown calls startResize with 'terminal' panel id
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { useDockHandlers } from './ChatWorkbenchTerminalDock.handlers';

function makeTerminal(
  overrides: Partial<UseTerminalSessionsReturn> = {},
): UseTerminalSessionsReturn {
  return {
    sessions: [],
    activeSessionId: null,
    setActiveSessionId: vi.fn(),
    recordingSessions: new Set<string>(),
    spawnSession: vi.fn().mockResolvedValue(undefined),
    spawnClaudeSession: vi.fn().mockResolvedValue(undefined),
    spawnCodexSession: vi.fn().mockResolvedValue(undefined),
    handleTerminalClose: vi.fn(),
    handleTerminalRestart: vi.fn().mockResolvedValue(undefined),
    handleTerminalTitleChange: vi.fn(),
    handleToggleRecording: vi.fn().mockResolvedValue(undefined),
    handleSplit: vi.fn().mockResolvedValue(undefined),
    handleCloseSplit: vi.fn(),
    handleTerminalReorder: vi.fn(),
    ...overrides,
  };
}

const mockSizes = { leftSidebar: 220, rightSidebar: 300, terminal: 280 };
const mockStartResize = vi.fn();

function renderHandlers(terminal: UseTerminalSessionsReturn) {
  return renderHook(() => useDockHandlers(terminal, mockSizes, mockStartResize));
}

describe('useDockHandlers', () => {
  describe('handleCloseSession', () => {
    it('calls handleTerminalClose with activeSessionId when a session is active', () => {
      const handleTerminalClose = vi.fn();
      const terminal = makeTerminal({ activeSessionId: 'sess-1', handleTerminalClose });
      const { result } = renderHandlers(terminal);
      result.current.handleCloseSession();
      expect(handleTerminalClose).toHaveBeenCalledWith('sess-1');
    });

    it('is a no-op when activeSessionId is null', () => {
      const handleTerminalClose = vi.fn();
      const terminal = makeTerminal({ activeSessionId: null, handleTerminalClose });
      const { result } = renderHandlers(terminal);
      result.current.handleCloseSession();
      expect(handleTerminalClose).not.toHaveBeenCalled();
    });
  });

  describe('handleNewClaude', () => {
    it('calls spawnClaudeSession', () => {
      const spawnClaudeSession = vi.fn().mockResolvedValue(undefined);
      const terminal = makeTerminal({ spawnClaudeSession });
      const { result } = renderHandlers(terminal);
      result.current.handleNewClaude();
      expect(spawnClaudeSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleNewCodex', () => {
    it('calls spawnCodexSession', () => {
      const spawnCodexSession = vi.fn().mockResolvedValue(undefined);
      const terminal = makeTerminal({ spawnCodexSession });
      const { result } = renderHandlers(terminal);
      result.current.handleNewCodex();
      expect(spawnCodexSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleToggleRecording', () => {
    it('calls handleToggleRecording with activeSessionId when a session is active', () => {
      const handleToggleRecording = vi.fn().mockResolvedValue(undefined);
      const terminal = makeTerminal({ activeSessionId: 'sess-2', handleToggleRecording });
      const { result } = renderHandlers(terminal);
      result.current.handleToggleRecording();
      expect(handleToggleRecording).toHaveBeenCalledWith('sess-2');
    });

    it('is a no-op when activeSessionId is null', () => {
      const handleToggleRecording = vi.fn().mockResolvedValue(undefined);
      const terminal = makeTerminal({ activeSessionId: null, handleToggleRecording });
      const { result } = renderHandlers(terminal);
      result.current.handleToggleRecording();
      expect(handleToggleRecording).not.toHaveBeenCalled();
    });
  });

  describe('isRecording', () => {
    it('is true when activeSessionId is in recordingSessions', () => {
      const terminal = makeTerminal({
        activeSessionId: 'sess-3',
        recordingSessions: new Set(['sess-3']),
      });
      const { result } = renderHandlers(terminal);
      expect(result.current.isRecording).toBe(true);
    });

    it('is false when activeSessionId is not in recordingSessions', () => {
      const terminal = makeTerminal({
        activeSessionId: 'sess-3',
        recordingSessions: new Set(['other-sess']),
      });
      const { result } = renderHandlers(terminal);
      expect(result.current.isRecording).toBe(false);
    });

    it('is false when activeSessionId is null', () => {
      const terminal = makeTerminal({
        activeSessionId: null,
        recordingSessions: new Set(['sess-3']),
      });
      const { result } = renderHandlers(terminal);
      expect(result.current.isRecording).toBe(false);
    });
  });

  describe('handleResizePointerDown', () => {
    it('calls startResize with terminal panel id and current terminal size', () => {
      const terminal = makeTerminal();
      const { result } = renderHandlers(terminal);
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientY: 400,
        target: { setPointerCapture: vi.fn() },
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLDivElement>;
      result.current.handleResizePointerDown(fakeEvent);
      expect(mockStartResize).toHaveBeenCalledWith('terminal', 'horizontal', 280, 400);
    });
  });
});
