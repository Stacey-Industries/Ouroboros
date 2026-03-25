import type { MutableRefObject } from 'react';
import { useEffect } from 'react';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import { hasElectronAPI, persistRunningSessions, restoreSessions } from './useSessionManager.core';
import type { SessionManagerActionArgs, SessionManagerActions } from './useSessionManager.helpers';

/** Spawns the correct PTY process type for a restarted session. */
export function spawnBySessionType(session: TerminalSession, cwd: string): Promise<unknown> {
  if (session.isClaude) {
    return window.electronAPI.pty.spawnClaude(session.id, {
      cwd,
      resumeMode: session.claudeSessionId,
    });
  }
  if (session.isCodex) {
    return window.electronAPI.pty.spawnCodex(session.id, {
      cwd,
      resumeThreadId: session.codexThreadId,
    });
  }
  return window.electronAPI.pty.spawn(session.id, { cwd });
}

export function useRestoreSessionsEffect(args: {
  actionArgs: SessionManagerActionArgs;
  hasRestoredSessionsRef: MutableRefObject<boolean>;
  spawnSession: SessionManagerActions['spawnSession'];
}): void {
  const { actionArgs, hasRestoredSessionsRef, spawnSession } = args;
  useEffect(() => {
    if (!hasElectronAPI() || hasRestoredSessionsRef.current) return;
    hasRestoredSessionsRef.current = true;
    void restoreSessions({ ...actionArgs, spawnSession });
  }, [actionArgs, hasRestoredSessionsRef, spawnSession]);
}

export function usePersistenceEffect(sessionsRef: MutableRefObject<TerminalSession[]>): void {
  useEffect(() => {
    if (!hasElectronAPI()) return;
    const interval = setInterval(() => {
      void persistRunningSessions(sessionsRef.current);
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionsRef]);
}
