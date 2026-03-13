import { useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';

export type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
export type ActiveSessionSetter = Dispatch<SetStateAction<string | null>>;
export type RecordingSetter = Dispatch<SetStateAction<Set<string>>>;
export type KillTimersRef = MutableRefObject<Map<string, ReturnType<typeof setTimeout>[]>>;

interface RestoreSessionsArgs {
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  spawnCountRef: MutableRefObject<number>;
  killTimersRef: KillTimersRef;
  spawnSession: (optionalCwd?: string) => Promise<void>;
}

interface SavedSessionSnapshot {
  cwd: string;
}

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function generateSessionId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildSessionLabel(index: number): string {
  return `Terminal ${index + 1}`;
}

export function buildClaudeSessionLabel(index: number, label?: string): string {
  return label ?? `Claude ${index + 1}`;
}

export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function clearKillTimers(killTimersRef: KillTimersRef, sessionId: string): void {
  const timers = killTimersRef.current.get(sessionId);
  if (!timers) {
    return;
  }

  timers.forEach(clearTimeout);
  killTimersRef.current.delete(sessionId);
}

export function updateSessionStatus(
  setSessions: SessionSetter,
  sessionId: string,
  update: (session: TerminalSession) => TerminalSession,
): void {
  setSessions((prev) => prev.map((session) => (session.id === sessionId ? update(session) : session)));
}

export function markSessionExited(setSessions: SessionSetter, sessionId: string): void {
  updateSessionStatus(setSessions, sessionId, (session) => ({ ...session, status: 'exited' }));
}

export function markSessionError(setSessions: SessionSetter, sessionId: string): void {
  updateSessionStatus(setSessions, sessionId, (session) => ({
    ...session,
    status: 'exited',
    title: `${session.title} [error]`,
  }));
}

export function normalizeRestartTitle(title: string): string {
  return title.replace(/ \[exited\]$/, '').replace(/ \[error\]$/, '');
}

export function setRecordingState(
  setRecordingSessions: RecordingSetter,
  sessionId: string,
  recording: boolean,
): void {
  setRecordingSessions((prev) => {
    const next = new Set(prev);
    if (recording) {
      next.add(sessionId);
    } else {
      next.delete(sessionId);
    }
    return next;
  });
}

export function registerExitListener(args: {
  sessionId: string;
  setSessions: SessionSetter;
  killTimersRef: KillTimersRef;
  onExit?: (sessionId: string) => void;
}): void {
  const { sessionId, setSessions, killTimersRef, onExit } = args;
  const exitCleanup = window.electronAPI.pty.onExit(sessionId, () => {
    exitCleanup();
    if (onExit) {
      onExit(sessionId);
    } else {
      markSessionExited(setSessions, sessionId);
    }
    clearKillTimers(killTimersRef, sessionId);
  });
}

export async function resolveSessionCwd(optionalCwd?: string): Promise<string | undefined> {
  if (optionalCwd) {
    return optionalCwd;
  }

  try {
    return await window.electronAPI.config.get('defaultProjectRoot');
  } catch {
    return undefined;
  }
}

export async function spawnManagedSession(args: {
  id: string;
  title: string;
  isClaude?: boolean;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  killTimersRef: KillTimersRef;
  spawnProcess: () => Promise<unknown>;
}): Promise<void> {
  const { id, title, isClaude, setSessions, setActiveSessionId, killTimersRef, spawnProcess } = args;
  const newSession: TerminalSession = {
    id,
    title,
    status: 'running',
    ...(isClaude ? { isClaude: true } : {}),
  };

  setSessions((prev) => [...prev, newSession]);
  setActiveSessionId(id);

  try {
    await spawnProcess();
    registerExitListener({ sessionId: id, setSessions, killTimersRef });
  } catch {
    markSessionError(setSessions, id);
  }
}

export function scheduleGracefulKill(sessionId: string, killTimersRef: KillTimersRef): void {
  clearKillTimers(killTimersRef, sessionId);
  void window.electronAPI.pty.write(sessionId, '\x03');

  const firstAttempt = setTimeout(() => {
    void window.electronAPI.pty.kill(sessionId);
  }, 3000);
  const secondAttempt = setTimeout(() => {
    void window.electronAPI.pty.kill(sessionId);
  }, 6000);

  killTimersRef.current.set(sessionId, [firstAttempt, secondAttempt]);
}

export function getNextActiveSessionId(
  previousSessions: TerminalSession[],
  nextSessions: TerminalSession[],
  closedSessionId: string,
  activeSessionId: string | null,
): string | null {
  if (nextSessions.length === 0) {
    return null;
  }

  if (activeSessionId !== closedSessionId) {
    return activeSessionId;
  }

  const closedIndex = previousSessions.findIndex((session) => session.id === closedSessionId);
  return nextSessions[Math.min(closedIndex, nextSessions.length - 1)]?.id ?? null;
}

function restoreActiveSessions(args: RestoreSessionsArgs, active: Array<{ id: string }>): boolean {
  if (active.length === 0) {
    return false;
  }

  const reconnected: TerminalSession[] = active.map((session, index) => ({
    id: session.id,
    title: buildSessionLabel(index),
    status: 'running',
  }));

  args.setSessions(reconnected);
  args.setActiveSessionId(reconnected[0]?.id ?? null);
  args.spawnCountRef.current = reconnected.length;
  reconnected.forEach((session) => {
    registerExitListener({
      sessionId: session.id,
      setSessions: args.setSessions,
      killTimersRef: args.killTimersRef,
    });
  });
  return true;
}

function hasSavedSessionCwd(snapshot: unknown): snapshot is SavedSessionSnapshot {
  return Boolean(snapshot && typeof snapshot === 'object' && typeof (snapshot as SavedSessionSnapshot).cwd === 'string');
}

async function restoreSavedSessions(
  saved: unknown,
  spawnSession: (optionalCwd?: string) => Promise<void>,
): Promise<void> {
  if (!Array.isArray(saved) || saved.length === 0) {
    await spawnSession();
    return;
  }

  for (const snapshot of saved) {
    if (hasSavedSessionCwd(snapshot)) {
      await spawnSession(snapshot.cwd);
    }
  }
}

export async function restoreSessions(args: RestoreSessionsArgs): Promise<void> {
  try {
    const active = await window.electronAPI.pty.listSessions();
    if (restoreActiveSessions(args, active)) {
      return;
    }

    const saved = await window.electronAPI.config.get('terminalSessions');
    await restoreSavedSessions(saved, args.spawnSession);
  } catch {
    await args.spawnSession();
  }
}

async function buildSessionSnapshot(session: TerminalSession): Promise<{ cwd: string; title: string }> {
  try {
    const result = await window.electronAPI.pty.getCwd(session.id);
    return { cwd: result.cwd ?? '', title: session.title };
  } catch {
    return { cwd: '', title: session.title };
  }
}

export async function persistRunningSessions(sessions: TerminalSession[]): Promise<void> {
  const runningSessions = sessions.filter((session) => session.status === 'running');
  if (runningSessions.length === 0) {
    return;
  }

  const snapshots = await Promise.all(runningSessions.map(buildSessionSnapshot));
  try {
    await window.electronAPI.config.set('terminalSessions', snapshots);
  } catch {
    // Best-effort persistence.
  }
}
