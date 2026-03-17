import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import { hasElectronAPI, serializeSavedSessionSnapshots } from './useTerminalSessions.effects';

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type RecordingSessionSetter = Dispatch<SetStateAction<Set<string>>>;

const SESSION_PERSIST_DEBOUNCE_MS = 750;
const SESSION_PERSIST_SAFETY_MS = 30000;

interface SavedSessionSnapshot {
  cwd: string;
  title: string;
  isClaude?: boolean;
  claudeSessionId?: string;
}

function getRunningSessions(sessions: TerminalSession[]): TerminalSession[] {
  return sessions.filter((session) => session.status === 'running');
}

function buildRunningTopologySignature(sessions: TerminalSession[]): string {
  return JSON.stringify(
    sessions.map((session) => ({
      id: session.id,
      isClaude: session.isClaude === true,
      claudeSessionId: session.claudeSessionId ?? null,
    })),
  );
}

function serializeSnapshots(snapshots: SavedSessionSnapshot[]): string {
  return serializeSavedSessionSnapshots(snapshots);
}

async function persistCurrentSessions(
  sessionsRef: MutableRefObject<TerminalSession[]>,
  lastPersistedSerializedRef: MutableRefObject<string | null>,
  persistInFlightRef: MutableRefObject<boolean>,
  hasPendingPersistRef: MutableRefObject<boolean>,
): Promise<void> {
  if (persistInFlightRef.current) {
    hasPendingPersistRef.current = true;
    return;
  }

  persistInFlightRef.current = true;

  try {
    const running = getRunningSessions(sessionsRef.current);
    const snapshots = running.length > 0 ? await Promise.all(running.map(readSessionSnapshot)) : [];
    const serialized = serializeSnapshots(snapshots);
    if (serialized === lastPersistedSerializedRef.current) return;

    await window.electronAPI.config.set('terminalSessions', snapshots);
    lastPersistedSerializedRef.current = serialized;
  } catch {
    return;
  } finally {
    persistInFlightRef.current = false;

    if (hasPendingPersistRef.current) {
      hasPendingPersistRef.current = false;
      void persistCurrentSessions(
        sessionsRef,
        lastPersistedSerializedRef,
        persistInFlightRef,
        hasPendingPersistRef,
      );
    }
  }
}

export function usePersistSessions(
  sessions: TerminalSession[],
  enabled: boolean,
  persistedSessionsSeed: string | null,
): void {
  const sessionsRef = useRef(sessions);
  const lastPersistedSerializedRef = useRef<string | null>(null);
  const persistInFlightRef = useRef(false);
  const hasPendingPersistRef = useRef(false);
  sessionsRef.current = sessions;

  const runningTopologySignature = buildRunningTopologySignature(getRunningSessions(sessions));

  useEffect(() => {
    if (!enabled || persistedSessionsSeed === null) return;
    if (lastPersistedSerializedRef.current !== null) return;
    lastPersistedSerializedRef.current = persistedSessionsSeed;
  }, [enabled, persistedSessionsSeed]);

  useEffect(() => {
    if (!enabled || !hasElectronAPI()) return;

    const timeout = setTimeout(() => {
      void persistCurrentSessions(
        sessionsRef,
        lastPersistedSerializedRef,
        persistInFlightRef,
        hasPendingPersistRef,
      );
    }, SESSION_PERSIST_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [enabled, runningTopologySignature]);

  useEffect(() => {
    if (!enabled || !hasElectronAPI()) return;

    const interval = setInterval(() => {
      void persistCurrentSessions(
        sessionsRef,
        lastPersistedSerializedRef,
        persistInFlightRef,
        hasPendingPersistRef,
      );
    }, SESSION_PERSIST_SAFETY_MS);

    return () => clearInterval(interval);
  }, [enabled]);
}

function createSessionSnapshot(session: TerminalSession, cwd: string): SavedSessionSnapshot {
  return {
    cwd,
    title: session.title,
    isClaude: session.isClaude === true,
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
