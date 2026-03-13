import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import { hasElectronAPI } from './useTerminalSessions.effects';

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type RecordingSessionSetter = Dispatch<SetStateAction<Set<string>>>;

interface SavedSessionSnapshot {
  cwd: string;
  title?: string;
  isClaude?: boolean;
  claudeSessionId?: string;
}

export function usePersistSessions(sessions: TerminalSession[]): void {
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!hasElectronAPI()) return;

    const interval = setInterval(() => {
      const running = sessionsRef.current.filter((session) => session.status === 'running');
      if (running.length > 0) void persistRunning(running);
    }, 5000);

    return () => clearInterval(interval);
  }, []);
}

function createSessionSnapshot(session: TerminalSession, cwd: string): SavedSessionSnapshot {
  return {
    cwd,
    title: session.title,
    isClaude: session.isClaude ?? false,
    claudeSessionId: session.claudeSessionId,
  };
}

async function readSessionSnapshot(session: TerminalSession): Promise<SavedSessionSnapshot> {
  try {
    const result = await window.electronAPI.pty.getCwd(session.id);
    return createSessionSnapshot(session, result.cwd ?? '');
  } catch {
    return createSessionSnapshot(session, '');
  }
}

async function persistRunning(running: TerminalSession[]): Promise<void> {
  const snapshots = await Promise.all(running.map(readSessionSnapshot));
  try {
    await window.electronAPI.config.set('terminalSessions', snapshots);
  } catch {
    return;
  }
}

export function useClaudeSessionCapture(
  pendingClaudeAssocRef: MutableRefObject<string[]>,
  setSessions: SessionSetter,
): void {
  useEffect(() => {
    if (!hasElectronAPI()) return;

    return window.electronAPI.hooks.onAgentEvent((event) => {
      const payload = event as { type?: string; sessionId?: string };
      if (payload.type !== 'session_start' || typeof payload.sessionId !== 'string') return;

      const ptyId = pendingClaudeAssocRef.current.shift();
      if (!ptyId) return;
      setSessions((prev) =>
        prev.map((session) => (session.id === ptyId ? { ...session, claudeSessionId: payload.sessionId } : session)),
      );
    });
  }, [pendingClaudeAssocRef, setSessions]);
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

export function useRecordingSync(
  sessions: TerminalSession[],
  setRecordingSessions: RecordingSessionSetter,
): void {
  useEffect(() => {
    if (!hasElectronAPI()) return;

    const cleanups = sessions.map((session) =>
      window.electronAPI.pty.onRecordingState(session.id, ({ recording }) => {
        applyRecordingState(setRecordingSessions, session.id, recording);
      }),
    );

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [sessions, setRecordingSessions]);
}
