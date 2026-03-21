import { useCallback, useRef, useState } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import {
  registerExitHandler,
  useKillTimers,
  useRestoreSessions,
  useSessionSpawners,
} from './useTerminalSessions.effects';
import type { UseTerminalSessionsReturn } from './useTerminalSessions.effects';
import { useTerminalSessionHandlers } from './useTerminalSessions.handlers';
import {
  useClaudeSessionCapture,
  usePersistSessions,
  useRecordingSync,
} from './useTerminalSessions.sync';

export type { SpawnClaudeOptions, SpawnCodexOptions, UseTerminalSessionsReturn } from './useTerminalSessions.effects';

export function useTerminalSessions(): UseTerminalSessionsReturn & { focusOrCreateSession: (id: string) => void } {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recordingSessions, setRecordingSessions] = useState<Set<string>>(new Set());
  const spawnCountRef = useRef(0);
  const pendingClaudeAssocRef = useRef<string[]>([]);
  const timerApi = useKillTimers();
  const { spawnSession, spawnClaudeSession, spawnCodexSession } = useSessionSpawners({
    spawnCountRef,
    pendingClaudeAssocRef,
    setSessions,
    setActiveSessionId,
    clearKillTimers: timerApi.clearKillTimers,
  });
  const handlers = useTerminalSessionHandlers({
    sessions,
    activeSessionId,
    recordingSessions,
    setSessions,
    setActiveSessionId,
    setRecordingSessions,
    clearKillTimers: timerApi.clearKillTimers,
    setKillTimers: timerApi.setKillTimers,
  });

  const hasCompletedRestore = useRestoreSessions({
    spawnSession,
    spawnClaudeSession,
    spawnCodexSession,
    setSessions,
    setActiveSessionId,
    spawnCountRef,
    clearKillTimers: timerApi.clearKillTimers,
  });
  usePersistSessions(sessions, hasCompletedRestore.hasCompletedRestore, hasCompletedRestore.persistedSessionsSeed);
  useClaudeSessionCapture(pendingClaudeAssocRef, setSessions);
  useRecordingSync(sessions, setRecordingSessions);

  // Activate a session by ID. If it doesn't exist in the sessions array
  // (e.g. agent PTY sessions spawned by the main process), add it first.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const focusOrCreateSession = useCallback((id: string) => {
    const exists = sessionsRef.current.some((s) => s.id === id);
    if (exists) {
      setActiveSessionId(id);
      return;
    }

    // Create a terminal tab entry for an agent PTY session that was spawned
    // on the main process without the renderer's knowledge.
    const session: TerminalSession = {
      id,
      title: id.startsWith('agent-pty-') ? 'Agent Claude' : `Terminal ${id}`,
      status: 'running',
      isClaude: true,
    };
    setSessions((prev) => [...prev, session]);
    setActiveSessionId(id);
    registerExitHandler(id, setSessions, timerApi.clearKillTimers);
  }, [setActiveSessionId, setSessions, timerApi.clearKillTimers]);

  return { sessions, activeSessionId, setActiveSessionId, recordingSessions, spawnSession, spawnClaudeSession, spawnCodexSession, focusOrCreateSession, ...handlers };
}
