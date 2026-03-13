import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import type {
  ClaudeSessionOptions,
  SessionManagerActionArgs,
  SessionManagerActions,
} from './useSessionManager.helpers';
import {
  buildClaudeSessionLabel,
  buildSessionLabel,
  getNextActiveSessionId,
  hasElectronAPI,
  normalizeRestartTitle,
  persistRunningSessions,
  registerExitListener,
  resolveSessionCwd,
  scheduleGracefulKill,
  setRecordingState,
  spawnManagedSession,
  updateSessionStatus,
  useLatestRef,
  generateSessionId,
} from './useSessionManager.core';
import { restoreSessions } from './useSessionManager.core';

interface SessionManagerRefs {
  sessionsRef: MutableRefObject<TerminalSession[]>;
  activeSessionIdRef: MutableRefObject<string | null>;
  recordingSessionsRef: MutableRefObject<Set<string>>;
  hasRestoredSessionsRef: MutableRefObject<boolean>;
}

function useSessionManagerRefs(args: SessionManagerActionArgs): SessionManagerRefs {
  const sessionsRef = useLatestRef(args.sessions);
  const activeSessionIdRef = useLatestRef(args.activeSessionId);
  const recordingSessionsRef = useLatestRef(args.recordingSessions);
  const hasRestoredSessionsRef = useRef(false);
  return { sessionsRef, activeSessionIdRef, recordingSessionsRef, hasRestoredSessionsRef };
}

function useSpawnSessionAction(args: SessionManagerActionArgs): SessionManagerActions['spawnSession'] {
  const { spawnCountRef, setSessions, setActiveSessionId, killTimersRef } = args;
  return useCallback(async (optionalCwd?: string): Promise<void> => {
    const id = generateSessionId();
    const index = spawnCountRef.current;
    spawnCountRef.current += 1;
    const cwd = await resolveSessionCwd(optionalCwd);
    await spawnManagedSession({
      id,
      title: buildSessionLabel(index),
      setSessions,
      setActiveSessionId,
      killTimersRef,
      spawnProcess: () => window.electronAPI.pty.spawn(id, { cwd }),
    });
  }, [killTimersRef, setActiveSessionId, setSessions, spawnCountRef]);
}

function useSpawnClaudeSessionAction(
  args: SessionManagerActionArgs,
): SessionManagerActions['spawnClaudeSession'] {
  const { spawnCountRef, setSessions, setActiveSessionId, killTimersRef } = args;
  return useCallback(async (
    optionalCwd?: string,
    options?: ClaudeSessionOptions,
  ): Promise<void> => {
    const id = generateSessionId();
    const index = spawnCountRef.current;
    spawnCountRef.current += 1;
    const cwd = await resolveSessionCwd(optionalCwd);
    await spawnManagedSession({
      id,
      title: buildClaudeSessionLabel(index, options?.label),
      isClaude: true,
      setSessions,
      setActiveSessionId,
      killTimersRef,
      spawnProcess: () => window.electronAPI.pty.spawnClaude(id, {
        cwd,
        initialPrompt: options?.initialPrompt,
        cliOverrides: options?.cliOverrides,
      }),
    });
  }, [killTimersRef, setActiveSessionId, setSessions, spawnCountRef]);
}

function useGracefulKillAction(
  killTimersRef: SessionManagerActionArgs['killTimersRef'],
): (sessionId: string) => void {
  return useCallback((sessionId: string): void => {
    scheduleGracefulKill(sessionId, killTimersRef);
  }, [killTimersRef]);
}

function useCloseAction(args: {
  sessionsRef: MutableRefObject<TerminalSession[]>;
  activeSessionIdRef: MutableRefObject<string | null>;
  setSessions: SessionManagerActionArgs['setSessions'];
  setActiveSessionId: SessionManagerActionArgs['setActiveSessionId'];
  gracefulKill: (sessionId: string) => void;
}): SessionManagerActions['handleTerminalClose'] {
  const { sessionsRef, activeSessionIdRef, setSessions, setActiveSessionId, gracefulKill } = args;
  return useCallback((sessionId: string): void => {
    const session = sessionsRef.current.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    if (session.status === 'running') {
      gracefulKill(sessionId);
    }

    const currentActiveSessionId = activeSessionIdRef.current;
    setSessions((prev) => {
      const next = prev.filter((item) => item.id !== sessionId);
      setActiveSessionId(getNextActiveSessionId(prev, next, sessionId, currentActiveSessionId));
      return next;
    });
  }, [activeSessionIdRef, gracefulKill, sessionsRef, setActiveSessionId, setSessions]);
}

function useRestartAction(args: {
  sessionsRef: MutableRefObject<TerminalSession[]>;
  setSessions: SessionManagerActionArgs['setSessions'];
  killTimersRef: SessionManagerActionArgs['killTimersRef'];
}): SessionManagerActions['handleTerminalRestart'] {
  const { sessionsRef, setSessions, killTimersRef } = args;
  return useCallback(async (sessionId: string): Promise<void> => {
    const session = sessionsRef.current.find((item) => item.id === sessionId);
    if (!session || session.status !== 'exited') {
      return;
    }

    const cwd = await resolveSessionCwd();
    try {
      await window.electronAPI.pty.spawn(sessionId, { cwd });
      updateSessionStatus(setSessions, sessionId, (item) => ({
        ...item,
        status: 'running',
        title: normalizeRestartTitle(item.title),
      }));
      registerExitListener({ sessionId, setSessions, killTimersRef });
    } catch {
      // Leave the session exited on restart failure.
    }
  }, [killTimersRef, sessionsRef, setSessions]);
}

function useTitleChangeAction(
  setSessions: SessionManagerActionArgs['setSessions'],
): SessionManagerActions['handleTerminalTitleChange'] {
  return useCallback((sessionId: string, title: string): void => {
    if (!title) {
      return;
    }
    updateSessionStatus(setSessions, sessionId, (session) => ({ ...session, title }));
  }, [setSessions]);
}

function useReorderAction(
  setSessions: SessionManagerActionArgs['setSessions'],
): SessionManagerActions['handleTerminalReorder'] {
  return useCallback((reordered: TerminalSession[]): void => {
    setSessions(reordered);
  }, [setSessions]);
}

function useRestoreSessionsEffect(args: {
  actionArgs: SessionManagerActionArgs;
  hasRestoredSessionsRef: MutableRefObject<boolean>;
  spawnSession: SessionManagerActions['spawnSession'];
}): void {
  const { actionArgs, hasRestoredSessionsRef, spawnSession } = args;
  useEffect(() => {
    if (!hasElectronAPI() || hasRestoredSessionsRef.current) {
      return;
    }

    hasRestoredSessionsRef.current = true;
    void restoreSessions({ ...actionArgs, spawnSession });
  }, [actionArgs, hasRestoredSessionsRef, spawnSession]);
}

function usePersistenceEffect(sessionsRef: MutableRefObject<TerminalSession[]>): void {
  useEffect(() => {
    if (!hasElectronAPI()) {
      return;
    }

    const interval = setInterval(() => {
      void persistRunningSessions(sessionsRef.current);
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionsRef]);
}

function useToggleRecordingAction(args: {
  recordingSessionsRef: MutableRefObject<Set<string>>;
  setRecordingSessions: SessionManagerActionArgs['setRecordingSessions'];
}): SessionManagerActions['handleToggleRecording'] {
  const { recordingSessionsRef, setRecordingSessions } = args;
  return useCallback(async (sessionId: string): Promise<void> => {
    if (recordingSessionsRef.current.has(sessionId)) {
      await window.electronAPI.pty.stopRecording(sessionId);
      setRecordingState(setRecordingSessions, sessionId, false);
      return;
    }

    await window.electronAPI.pty.startRecording(sessionId);
    setRecordingState(setRecordingSessions, sessionId, true);
  }, [recordingSessionsRef, setRecordingSessions]);
}

function useRecordingStateEffect(
  sessions: TerminalSession[],
  setRecordingSessions: SessionManagerActionArgs['setRecordingSessions'],
): void {
  useEffect(() => {
    if (!hasElectronAPI()) {
      return;
    }

    const cleanups = sessions.map((session) =>
      window.electronAPI.pty.onRecordingState(session.id, ({ recording }) => {
        setRecordingState(setRecordingSessions, session.id, recording);
      }),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [sessions, setRecordingSessions]);
}

function useSplitAction(args: {
  setSessions: SessionManagerActionArgs['setSessions'];
  killTimersRef: SessionManagerActionArgs['killTimersRef'];
}): SessionManagerActions['handleSplit'] {
  const { setSessions, killTimersRef } = args;
  return useCallback(async (primarySessionId: string): Promise<void> => {
    const splitId = generateSessionId();
    const cwd = await resolveSessionCwd();
    try {
      await window.electronAPI.pty.spawn(splitId, { cwd });
      registerExitListener({
        sessionId: splitId,
        setSessions,
        killTimersRef,
        onExit: () => {
          updateSessionStatus(setSessions, primarySessionId, (session) => ({
            ...session,
            splitStatus: 'exited',
          }));
        },
      });
      updateSessionStatus(setSessions, primarySessionId, (session) => ({
        ...session,
        splitSessionId: splitId,
        splitStatus: 'running',
      }));
    } catch {
      // Ignore split spawn failures.
    }
  }, [killTimersRef, setSessions]);
}

function useCloseSplitAction(args: {
  setSessions: SessionManagerActionArgs['setSessions'];
  gracefulKill: (sessionId: string) => void;
}): SessionManagerActions['handleCloseSplit'] {
  const { setSessions, gracefulKill } = args;
  return useCallback((primarySessionId: string): void => {
    setSessions((prev) => {
      const session = prev.find((item) => item.id === primarySessionId);
      if (session?.splitSessionId) {
        gracefulKill(session.splitSessionId);
      }

      return prev.map((item) =>
        item.id === primarySessionId
          ? { ...item, splitSessionId: undefined, splitStatus: undefined }
          : item,
      );
    });
  }, [gracefulKill, setSessions]);
}

export function useSessionManagerActions(args: SessionManagerActionArgs): SessionManagerActions {
  const refs = useSessionManagerRefs(args);
  const spawnSession = useSpawnSessionAction(args);
  const spawnClaudeSession = useSpawnClaudeSessionAction(args);
  const gracefulKill = useGracefulKillAction(args.killTimersRef);
  const handleTerminalClose = useCloseAction({ ...refs, ...args, gracefulKill });
  const handleTerminalRestart = useRestartAction({ ...refs, ...args });
  const handleTerminalTitleChange = useTitleChangeAction(args.setSessions);
  const handleTerminalReorder = useReorderAction(args.setSessions);
  const handleToggleRecording = useToggleRecordingAction({ ...refs, ...args });
  const handleSplit = useSplitAction(args);
  const handleCloseSplit = useCloseSplitAction({ setSessions: args.setSessions, gracefulKill });

  useRestoreSessionsEffect({ actionArgs: args, hasRestoredSessionsRef: refs.hasRestoredSessionsRef, spawnSession });
  usePersistenceEffect(refs.sessionsRef);
  useRecordingStateEffect(args.sessions, args.setRecordingSessions);

  return {
    spawnSession,
    spawnClaudeSession,
    handleTerminalClose,
    handleTerminalRestart,
    handleTerminalTitleChange,
    handleTerminalReorder,
    handleSplit,
    handleCloseSplit,
    handleToggleRecording,
  };
}
