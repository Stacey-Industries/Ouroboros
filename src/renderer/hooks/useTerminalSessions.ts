import { useRef, useState } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import {
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

export type { SpawnClaudeOptions, UseTerminalSessionsReturn } from './useTerminalSessions.effects';

export function useTerminalSessions(): UseTerminalSessionsReturn {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recordingSessions, setRecordingSessions] = useState<Set<string>>(new Set());
  const spawnCountRef = useRef(0);
  const pendingClaudeAssocRef = useRef<string[]>([]);
  const timerApi = useKillTimers();
  const { spawnSession, spawnClaudeSession } = useSessionSpawners({
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

  useRestoreSessions({ spawnSession, spawnClaudeSession, setSessions, setActiveSessionId, spawnCountRef, clearKillTimers: timerApi.clearKillTimers });
  usePersistSessions(sessions);
  useClaudeSessionCapture(pendingClaudeAssocRef, setSessions);
  useRecordingSync(sessions, setRecordingSessions);

  return { sessions, activeSessionId, setActiveSessionId, recordingSessions, spawnSession, spawnClaudeSession, ...handlers };
}
