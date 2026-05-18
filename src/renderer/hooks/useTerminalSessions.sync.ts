import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import { hasElectronAPI, serializeSavedSessionSnapshots } from './useTerminalSessions.effects';
import type { PendingCodexCapture, SavedSessionSnapshot } from './useTerminalSessions.sync.helpers';
import {
  applyPendingBind,
  applyTerminalFallbackBind,
  attemptCodexCapture,
  readSessionSnapshot,
  TERMINAL_BIND_TRIGGER_TYPES,
} from './useTerminalSessions.sync.helpers';
export type { PendingCodexCapture, SavedSessionSnapshot } from './useTerminalSessions.sync.helpers';

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type RecordingSessionSetter = Dispatch<SetStateAction<Set<string>>>;

const SESSION_PERSIST_DEBOUNCE_MS = 750;
const SESSION_PERSIST_SAFETY_MS = 30000;

function getRunningSessions(sessions: TerminalSession[]): TerminalSession[] {
  return sessions.filter((session) => session.status === 'running');
}

function buildRunningTopologySignature(sessions: TerminalSession[]): string {
  return JSON.stringify(
    sessions.map((session) => ({
      id: session.id,
      isClaude: session.isClaude === true,
      isCodex: session.isCodex === true,
      claudeSessionId: session.claudeSessionId ?? null,
      codexThreadId: session.codexThreadId ?? null,
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

function usePersistRefs(sessions: TerminalSession[]): {
  sessionsRef: MutableRefObject<TerminalSession[]>;
  lastPersistedSerializedRef: MutableRefObject<string | null>;
  persistInFlightRef: MutableRefObject<boolean>;
  hasPendingPersistRef: MutableRefObject<boolean>;
} {
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  return {
    sessionsRef,
    lastPersistedSerializedRef: useRef<string | null>(null),
    persistInFlightRef: useRef(false),
    hasPendingPersistRef: useRef(false),
  };
}

function usePersistSessionsSeedEffect(
  enabled: boolean,
  persistedSessionsSeed: string | null,
  lastPersistedSerializedRef: MutableRefObject<string | null>,
): void {
  useEffect(() => {
    if (!enabled || persistedSessionsSeed === null) return;
    if (lastPersistedSerializedRef.current !== null) return;
    lastPersistedSerializedRef.current = persistedSessionsSeed;
  }, [enabled, persistedSessionsSeed, lastPersistedSerializedRef]);
}

interface UsePersistSessionsDebounceEffectOptions {
  enabled: boolean;
  runningTopologySignature: string;
  sessionsRef: MutableRefObject<TerminalSession[]>;
  lastPersistedSerializedRef: MutableRefObject<string | null>;
  persistInFlightRef: MutableRefObject<boolean>;
  hasPendingPersistRef: MutableRefObject<boolean>;
}

function usePersistSessionsDebounceEffect(options: UsePersistSessionsDebounceEffectOptions): void {
  const {
    enabled,
    runningTopologySignature,
    sessionsRef,
    lastPersistedSerializedRef,
    persistInFlightRef,
    hasPendingPersistRef,
  } = options;
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
  }, [
    enabled,
    runningTopologySignature,
    sessionsRef,
    lastPersistedSerializedRef,
    persistInFlightRef,
    hasPendingPersistRef,
  ]);
}

interface UsePersistSessionsSafetyEffectOptions {
  enabled: boolean;
  sessionsRef: MutableRefObject<TerminalSession[]>;
  lastPersistedSerializedRef: MutableRefObject<string | null>;
  persistInFlightRef: MutableRefObject<boolean>;
  hasPendingPersistRef: MutableRefObject<boolean>;
}

function usePersistSessionsSafetyEffect(options: UsePersistSessionsSafetyEffectOptions): void {
  const {
    enabled,
    sessionsRef,
    lastPersistedSerializedRef,
    persistInFlightRef,
    hasPendingPersistRef,
  } = options;
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
  }, [enabled, sessionsRef, lastPersistedSerializedRef, persistInFlightRef, hasPendingPersistRef]);
}

export function usePersistSessions(
  sessions: TerminalSession[],
  enabled: boolean,
  persistedSessionsSeed: string | null,
): void {
  const persistRefs = usePersistRefs(sessions);
  const { sessionsRef, persistInFlightRef, hasPendingPersistRef } = persistRefs;
  const { lastPersistedSerializedRef } = persistRefs;
  const runningTopologySignature = buildRunningTopologySignature(getRunningSessions(sessions));

  usePersistSessionsSeedEffect(enabled, persistedSessionsSeed, lastPersistedSerializedRef);
  usePersistSessionsDebounceEffect({
    enabled,
    runningTopologySignature,
    sessionsRef,
    lastPersistedSerializedRef,
    persistInFlightRef,
    hasPendingPersistRef,
  });
  usePersistSessionsSafetyEffect({
    enabled,
    sessionsRef,
    lastPersistedSerializedRef,
    persistInFlightRef,
    hasPendingPersistRef,
  });
}

export function useClaudeSessionCapture(
  pendingClaudeAssocRef: MutableRefObject<string[]>,
  setSessions: SessionSetter,
  activeSessionId: string | null,
): void {
  useEffect(() => {
    if (!hasElectronAPI()) return;

    return window.electronAPI.hooks.onAgentEvent((event) => {
      const payload = event as { type?: string; sessionId?: string };
      if (typeof payload.sessionId !== 'string') return;

      // Prefer pending-ref binding (IDE-spawned sessions) on session_start only.
      if (payload.type === 'session_start') {
        const ptyId = pendingClaudeAssocRef.current.shift();
        if (ptyId) {
          applyPendingBind(ptyId, payload.sessionId, setSessions);
          return;
        }
      }

      // Wave 94 Phase E — terminal-launched fallback: bind to the active terminal
      // on ANY first event from an unknown sessionId (session_start is unreliable
      // for terminal-launched claude — pre_tool_use may arrive first or instead).
      // Guard: only bind-once (applyTerminalFallbackBind skips already-bound terminals).
      if (!activeSessionId) {
        return;
      }
      // Only bind write-class or session lifecycle events — skip noise events that
      // aren't meaningful indicators a new claude session is active in the terminal.
      if (!TERMINAL_BIND_TRIGGER_TYPES.has(payload.type ?? '')) return;
      applyTerminalFallbackBind(activeSessionId, payload.sessionId, setSessions);
    });
  }, [pendingClaudeAssocRef, setSessions, activeSessionId]);
}

const CODEX_CAPTURE_INTERVAL_MS = 3000;

export function useCodexSessionCapture(
  pendingCodexAssocRef: MutableRefObject<PendingCodexCapture[]>,
  setSessions: SessionSetter,
): void {
  useEffect(() => {
    if (!hasElectronAPI()) return;

    const intervalId = setInterval(() => {
      const pending = pendingCodexAssocRef.current;
      if (pending.length === 0) return;
      for (const entry of [...pending]) {
        void attemptCodexCapture(entry, pendingCodexAssocRef, setSessions);
      }
    }, CODEX_CAPTURE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [pendingCodexAssocRef, setSessions]);
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
