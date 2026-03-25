import React, { useCallback, useRef, useState } from 'react';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import type { UseTerminalSessionsReturn } from './useTerminalSessions.effects';
import {
  registerExitHandler,
  useKillTimers,
  useSessionSpawners,
} from './useTerminalSessions.effects';
import { useTerminalSessionHandlers } from './useTerminalSessions.handlers';
import { useRestoreSessions } from './useTerminalSessions.restore';
import {
  useClaudeSessionCapture,
  useCodexSessionCapture,
  usePersistSessions,
  useRecordingSync,
} from './useTerminalSessions.sync';
import type { PendingCodexCapture } from './useTerminalSessions.sync';

export type { SpawnClaudeOptions, SpawnCodexOptions, UseTerminalSessionsReturn } from './useTerminalSessions.effects';

function buildAgentPtySession(id: string): TerminalSession {
  return {
    id,
    title: id.startsWith('agent-pty-') ? 'Agent Claude' : `Terminal ${id}`,
    status: 'running',
    isClaude: true,
  };
}

function useFocusOrCreate(
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>,
  clearKillTimers: (id: string) => void,
): (id: string) => void {
  const sessionsRef = useRef<TerminalSession[]>([]);
  return useCallback((id: string) => {
    if (sessionsRef.current.some((s) => s.id === id)) {
      setActiveSessionId(id);
      return;
    }
    setSessions((prev) => {
      sessionsRef.current = [...prev, buildAgentPtySession(id)];
      return sessionsRef.current;
    });
    setActiveSessionId(id);
    registerExitHandler(id, setSessions, clearKillTimers);
  }, [setActiveSessionId, setSessions, clearKillTimers]);
}

export function useTerminalSessions(): UseTerminalSessionsReturn & { focusOrCreateSession: (id: string) => void } {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recordingSessions, setRecordingSessions] = useState<Set<string>>(new Set());
  const spawnCountRef = useRef(0);
  const pendingClaudeAssocRef = useRef<string[]>([]);
  const pendingCodexAssocRef = useRef<PendingCodexCapture[]>([]);
  const timerApi = useKillTimers();
  const { spawnSession, spawnClaudeSession, spawnCodexSession } = useSessionSpawners({
    spawnCountRef, pendingClaudeAssocRef, pendingCodexAssocRef, setSessions, setActiveSessionId, clearKillTimers: timerApi.clearKillTimers,
  });
  const handlers = useTerminalSessionHandlers({
    sessions, activeSessionId, recordingSessions, setSessions, setActiveSessionId,
    setRecordingSessions, clearKillTimers: timerApi.clearKillTimers, setKillTimers: timerApi.setKillTimers,
  });
  const restore = useRestoreSessions({
    spawnSession, spawnClaudeSession, spawnCodexSession, setSessions, setActiveSessionId,
    spawnCountRef, clearKillTimers: timerApi.clearKillTimers,
  });
  usePersistSessions(sessions, restore.hasCompletedRestore, restore.persistedSessionsSeed);
  useClaudeSessionCapture(pendingClaudeAssocRef, setSessions);
  useCodexSessionCapture(pendingCodexAssocRef, setSessions);
  useRecordingSync(sessions, setRecordingSessions);
  const focusOrCreateSession = useFocusOrCreate(setSessions, setActiveSessionId, timerApi.clearKillTimers);
  return { sessions, activeSessionId, setActiveSessionId, recordingSessions, spawnSession, spawnClaudeSession, spawnCodexSession, focusOrCreateSession, ...handlers };
}
