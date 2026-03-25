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
import type { PendingCodexCapture } from './useTerminalSessions.sync';
import {
  useClaudeSessionCapture,
  useCodexSessionCapture,
  usePersistSessions,
  useRecordingSync,
} from './useTerminalSessions.sync';

export type {
  SpawnClaudeOptions,
  SpawnCodexOptions,
  UseTerminalSessionsReturn,
} from './useTerminalSessions.effects';

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
  return useCallback(
    (id: string) => {
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
    },
    [setActiveSessionId, setSessions, clearKillTimers],
  );
}

interface SessionState {
  sessions: TerminalSession[];
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>;
  activeSessionId: string | null;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  recordingSessions: Set<string>;
  setRecordingSessions: React.Dispatch<React.SetStateAction<Set<string>>>;
}

function useSessionState(): SessionState {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recordingSessions, setRecordingSessions] = useState<Set<string>>(new Set());
  return {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    recordingSessions,
    setRecordingSessions,
  };
}

function useSideEffects(
  s: SessionState,
  restore: { hasCompletedRestore: boolean; persistedSessionsSeed: unknown },
  pendingClaudeRef: React.MutableRefObject<string[]>,
  pendingCodexRef: React.MutableRefObject<PendingCodexCapture[]>,
): void {
  usePersistSessions(s.sessions, restore.hasCompletedRestore, restore.persistedSessionsSeed);
  useClaudeSessionCapture(pendingClaudeRef, s.setSessions);
  useCodexSessionCapture(pendingCodexRef, s.setSessions);
  useRecordingSync(s.sessions, s.setRecordingSessions);
}

export function useTerminalSessions(): UseTerminalSessionsReturn & {
  focusOrCreateSession: (id: string) => void;
} {
  const s = useSessionState();
  const spawnCountRef = useRef(0);
  const pendingClaudeAssocRef = useRef<string[]>([]);
  const pendingCodexAssocRef = useRef<PendingCodexCapture[]>([]);
  const timerApi = useKillTimers();
  const spawners = useSessionSpawners({
    spawnCountRef,
    pendingClaudeAssocRef,
    pendingCodexAssocRef,
    setSessions: s.setSessions,
    setActiveSessionId: s.setActiveSessionId,
    clearKillTimers: timerApi.clearKillTimers,
  });
  const handlers = useTerminalSessionHandlers({
    ...s,
    clearKillTimers: timerApi.clearKillTimers,
    setKillTimers: timerApi.setKillTimers,
  });
  const restore = useRestoreSessions({
    ...spawners,
    setSessions: s.setSessions,
    setActiveSessionId: s.setActiveSessionId,
    spawnCountRef,
    clearKillTimers: timerApi.clearKillTimers,
  });
  useSideEffects(s, restore, pendingClaudeAssocRef, pendingCodexAssocRef);
  const focusOrCreateSession = useFocusOrCreate(
    s.setSessions,
    s.setActiveSessionId,
    timerApi.clearKillTimers,
  );
  return { ...s, ...spawners, focusOrCreateSession, ...handlers };
}
