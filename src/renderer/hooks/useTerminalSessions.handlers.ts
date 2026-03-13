import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import {
  generateSessionId,
  getDefaultCwd,
  registerExitHandler,
} from './useTerminalSessions.effects';
import type { UseTerminalSessionsReturn } from './useTerminalSessions.effects';

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type ActiveSessionSetter = Dispatch<SetStateAction<string | null>>;
type RecordingSessionSetter = Dispatch<SetStateAction<Set<string>>>;
type SessionHandlers = Pick<
  UseTerminalSessionsReturn,
  | 'handleTerminalClose'
  | 'handleTerminalRestart'
  | 'handleTerminalTitleChange'
  | 'handleToggleRecording'
  | 'handleSplit'
  | 'handleCloseSplit'
  | 'handleTerminalReorder'
>;

interface HandlerDependencies {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  recordingSessions: Set<string>;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  setRecordingSessions: RecordingSessionSetter;
  clearKillTimers: (id: string) => void;
  setKillTimers: (id: string, timers: ReturnType<typeof setTimeout>[]) => void;
}

interface CloseHandlerDependencies {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  gracefulKill: (sessionId: string) => void;
}

function nextActiveSessionId(
  previousSessions: TerminalSession[],
  nextSessions: TerminalSession[],
  activeSessionId: string | null,
  closedSessionId: string,
): string | null {
  if (nextSessions.length === 0) return null;
  if (activeSessionId !== closedSessionId) return activeSessionId;

  const closedIndex = previousSessions.findIndex((session) => session.id === closedSessionId);
  return nextSessions[Math.min(closedIndex, nextSessions.length - 1)].id;
}

function normalizeRestartTitle(title: string): string {
  return title.replace(/ \[exited\]$/, '').replace(/ \[error\]$/, '');
}

function applyRecordingState(
  setRecordingSessions: RecordingSessionSetter,
  sessionId: string,
  recording: boolean,
): void {
  setRecordingSessions((prev) => {
    const next = new Set(prev);
    if (recording) next.add(sessionId);
    else next.delete(sessionId);
    return next;
  });
}

function useGracefulKill(
  clearKillTimers: (id: string) => void,
  setKillTimers: (id: string, timers: ReturnType<typeof setTimeout>[]) => void,
): (sessionId: string) => void {
  return useCallback((sessionId: string): void => {
    clearKillTimers(sessionId);
    void window.electronAPI.pty.write(sessionId, '\x03');
    const firstTimer = setTimeout(() => void window.electronAPI.pty.kill(sessionId), 3000);
    const secondTimer = setTimeout(() => void window.electronAPI.pty.kill(sessionId), 6000);
    setKillTimers(sessionId, [firstTimer, secondTimer]);
  }, [clearKillTimers, setKillTimers]);
}

function useCloseHandler({
  sessions,
  activeSessionId,
  setSessions,
  setActiveSessionId,
  gracefulKill,
}: CloseHandlerDependencies): UseTerminalSessionsReturn['handleTerminalClose'] {
  return useCallback((sessionId: string): void => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.status === 'running') gracefulKill(sessionId);

    setSessions((prev) => {
      const next = prev.filter((item) => item.id !== sessionId);
      setActiveSessionId(nextActiveSessionId(prev, next, activeSessionId, sessionId));
      return next;
    });
  }, [activeSessionId, gracefulKill, sessions, setActiveSessionId, setSessions]);
}

function useRestartHandler(
  sessions: TerminalSession[],
  setSessions: SessionSetter,
  clearKillTimers: (id: string) => void,
): UseTerminalSessionsReturn['handleTerminalRestart'] {
  return useCallback(async (sessionId: string): Promise<void> => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== 'exited') return;

    const cwd = await getDefaultCwd();
    try {
      await window.electronAPI.pty.spawn(sessionId, { cwd });
      setSessions((prev) =>
        prev.map((item) =>
          item.id === sessionId ? { ...item, status: 'running', title: normalizeRestartTitle(item.title) } : item,
        ),
      );
      registerExitHandler(sessionId, setSessions, clearKillTimers);
    } catch {
      return;
    }
  }, [clearKillTimers, sessions, setSessions]);
}

function useTitleChangeHandler(setSessions: SessionSetter): UseTerminalSessionsReturn['handleTerminalTitleChange'] {
  return useCallback((sessionId: string, title: string): void => {
    if (!title) return;
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? { ...session, title } : session)));
  }, [setSessions]);
}

function useToggleRecordingHandler(
  recordingSessions: Set<string>,
  setRecordingSessions: RecordingSessionSetter,
): UseTerminalSessionsReturn['handleToggleRecording'] {
  return useCallback(async (sessionId: string): Promise<void> => {
    const recording = !recordingSessions.has(sessionId);
    if (recording) await window.electronAPI.pty.startRecording(sessionId);
    else await window.electronAPI.pty.stopRecording(sessionId);
    applyRecordingState(setRecordingSessions, sessionId, recording);
  }, [recordingSessions, setRecordingSessions]);
}

function useSplitHandler(
  setSessions: SessionSetter,
  clearKillTimers: (id: string) => void,
): UseTerminalSessionsReturn['handleSplit'] {
  return useCallback(async (primarySessionId: string): Promise<void> => {
    const splitId = generateSessionId();
    const cwd = await getDefaultCwd();

    try {
      await window.electronAPI.pty.spawn(splitId, { cwd });
      const exitCleanup = window.electronAPI.pty.onExit(splitId, () => {
        exitCleanup();
        setSessions((prev) =>
          prev.map((session) =>
            session.id === primarySessionId ? { ...session, splitStatus: 'exited' } : session,
          ),
        );
        clearKillTimers(splitId);
      });

      setSessions((prev) =>
        prev.map((session) =>
          session.id === primarySessionId
            ? { ...session, splitSessionId: splitId, splitStatus: 'running' }
            : session,
        ),
      );
    } catch {
      return;
    }
  }, [clearKillTimers, setSessions]);
}

function useCloseSplitHandler(
  setSessions: SessionSetter,
  gracefulKill: (sessionId: string) => void,
): UseTerminalSessionsReturn['handleCloseSplit'] {
  return useCallback((primarySessionId: string): void => {
    setSessions((prev) => {
      const session = prev.find((item) => item.id === primarySessionId);
      if (session?.splitSessionId) gracefulKill(session.splitSessionId);
      return prev.map((item) =>
        item.id === primarySessionId ? { ...item, splitSessionId: undefined, splitStatus: undefined } : item,
      );
    });
  }, [gracefulKill, setSessions]);
}

function useReorderHandler(setSessions: SessionSetter): UseTerminalSessionsReturn['handleTerminalReorder'] {
  return useCallback((reordered: TerminalSession[]): void => {
    setSessions(reordered);
  }, [setSessions]);
}

export function useTerminalSessionHandlers({
  sessions,
  activeSessionId,
  recordingSessions,
  setSessions,
  setActiveSessionId,
  setRecordingSessions,
  clearKillTimers,
  setKillTimers,
}: HandlerDependencies): SessionHandlers {
  const gracefulKill = useGracefulKill(clearKillTimers, setKillTimers);
  return {
    handleTerminalClose: useCloseHandler({
      sessions,
      activeSessionId,
      setSessions,
      setActiveSessionId,
      gracefulKill,
    }),
    handleTerminalRestart: useRestartHandler(sessions, setSessions, clearKillTimers),
    handleTerminalTitleChange: useTitleChangeHandler(setSessions),
    handleToggleRecording: useToggleRecordingHandler(recordingSessions, setRecordingSessions),
    handleSplit: useSplitHandler(setSessions, clearKillTimers),
    handleCloseSplit: useCloseSplitHandler(setSessions, gracefulKill),
    handleTerminalReorder: useReorderHandler(setSessions),
  };
}
