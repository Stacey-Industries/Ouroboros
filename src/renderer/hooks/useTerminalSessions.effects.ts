import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';

export interface UseTerminalSessionsReturn {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  recordingSessions: Set<string>;
  spawnSession: (optionalCwd?: string) => Promise<void>;
  spawnClaudeSession: (optionalCwd?: string, options?: SpawnClaudeOptions) => Promise<void>;
  handleTerminalClose: (sessionId: string) => void;
  handleTerminalRestart: (sessionId: string) => Promise<void>;
  handleTerminalTitleChange: (sessionId: string, title: string) => void;
  handleToggleRecording: (sessionId: string) => Promise<void>;
  handleSplit: (primarySessionId: string) => Promise<void>;
  handleCloseSplit: (primarySessionId: string) => void;
  handleTerminalReorder: (reordered: TerminalSession[]) => void;
}

export interface SpawnClaudeOptions {
  initialPrompt?: string;
  cliOverrides?: Record<string, unknown>;
  label?: string;
  resumeMode?: string;
}

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type ActiveSessionSetter = Dispatch<SetStateAction<string | null>>;
type SpawnSession = (optionalCwd?: string) => Promise<void>;
type SpawnClaudeSession = (optionalCwd?: string, options?: SpawnClaudeOptions) => Promise<void>;

interface KillTimerApi {
  clearKillTimers: (sessionId: string) => void;
  setKillTimers: (sessionId: string, timers: ReturnType<typeof setTimeout>[]) => void;
}

interface BaseSpawnDependencies {
  spawnCountRef: MutableRefObject<number>;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  clearKillTimers: (id: string) => void;
}

interface SpawnDependencies extends BaseSpawnDependencies {
  pendingClaudeAssocRef: MutableRefObject<string[]>;
}

interface RestoreDependencies {
  spawnSession: SpawnSession;
  spawnClaudeSession: SpawnClaudeSession;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  spawnCountRef: MutableRefObject<number>;
  clearKillTimers: (id: string) => void;
}

interface SpawnLifecycleArgs {
  session: TerminalSession;
  start: () => Promise<unknown>;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  clearKillTimers: (id: string) => void;
  onQueued?: () => void;
}

export interface SavedSessionSnapshot {
  cwd: string;
  title?: string;
  isClaude?: boolean;
  claudeSessionId?: string;
}

interface RestoreState {
  hasCompletedRestore: boolean;
  persistedSessionsSeed: string | null;
}

function isSavedSessionSnapshot(value: unknown): value is SavedSessionSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as SavedSessionSnapshot;
  return typeof snapshot.cwd === 'string'
    && (snapshot.title === undefined || typeof snapshot.title === 'string')
    && (snapshot.isClaude === undefined || typeof snapshot.isClaude === 'boolean')
    && (snapshot.claudeSessionId === undefined || typeof snapshot.claudeSessionId === 'string');
}

async function readSavedSessionSnapshots(): Promise<SavedSessionSnapshot[]> {
  const saved = await window.electronAPI.config.get('terminalSessions');
  if (!Array.isArray(saved)) {
    return [];
  }

  return saved.filter(isSavedSessionSnapshot);
}

export function serializeSavedSessionSnapshots(snapshots: SavedSessionSnapshot[]): string {
  return JSON.stringify(
    snapshots.map((snapshot) => ({
      cwd: snapshot.cwd,
      title: snapshot.title ?? '',
      isClaude: snapshot.isClaude === true,
      claudeSessionId: snapshot.claudeSessionId ?? null,
    })),
  );
}

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function generateSessionId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildSessionLabel(index: number): string {
  return `Terminal ${index + 1}`;
}

function nextSessionIdentity(spawnCountRef: MutableRefObject<number>): { id: string; index: number } {
  const id = generateSessionId();
  const index = spawnCountRef.current;
  spawnCountRef.current += 1;
  return { id, index };
}

export async function getDefaultCwd(): Promise<string | undefined> {
  try {
    return await window.electronAPI.config.get('defaultProjectRoot');
  } catch {
    return undefined;
  }
}

export function registerExitHandler(
  id: string,
  setSessions: SessionSetter,
  clearKillTimers: (id: string) => void,
): void {
  const exitCleanup = window.electronAPI.pty.onExit(id, () => {
    exitCleanup();
    setSessions((prev) => prev.map((session) => (session.id === id ? { ...session, status: 'exited' } : session)));
    clearKillTimers(id);
  });
}

function markSessionError(id: string, setSessions: SessionSetter): void {
  setSessions((prev) =>
    prev.map((session) =>
      session.id === id ? { ...session, status: 'exited', title: `${session.title} [error]` } : session,
    ),
  );
}

async function spawnSessionWithLifecycle({
  session,
  start,
  setSessions,
  setActiveSessionId,
  clearKillTimers,
  onQueued,
}: SpawnLifecycleArgs): Promise<void> {
  setSessions((prev) => [...prev, session]);
  setActiveSessionId(session.id);
  onQueued?.();

  try {
    await start();
    registerExitHandler(session.id, setSessions, clearKillTimers);
  } catch {
    markSessionError(session.id, setSessions);
  }
}

export function useKillTimers(): KillTimerApi {
  const killTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  const clearKillTimers = useCallback((sessionId: string): void => {
    const timers = killTimersRef.current.get(sessionId);
    if (!timers) return;
    timers.forEach(clearTimeout);
    killTimersRef.current.delete(sessionId);
  }, []);

  const setKillTimers = useCallback((sessionId: string, timers: ReturnType<typeof setTimeout>[]): void => {
    killTimersRef.current.set(sessionId, timers);
  }, []);

  return { clearKillTimers, setKillTimers };
}

function useSpawnSession({
  spawnCountRef,
  setSessions,
  setActiveSessionId,
  clearKillTimers,
}: BaseSpawnDependencies): SpawnSession {
  return useCallback(async (optionalCwd?: string): Promise<void> => {
    const { id, index } = nextSessionIdentity(spawnCountRef);
    const cwd = optionalCwd ?? await getDefaultCwd();
    const session: TerminalSession = { id, title: buildSessionLabel(index), status: 'running' };
    await spawnSessionWithLifecycle({
      session,
      setSessions,
      setActiveSessionId,
      clearKillTimers,
      start: () => window.electronAPI.pty.spawn(id, { cwd }),
    });
  }, [clearKillTimers, setActiveSessionId, setSessions, spawnCountRef]);
}

function useSpawnClaudeSession({
  spawnCountRef,
  pendingClaudeAssocRef,
  setSessions,
  setActiveSessionId,
  clearKillTimers,
}: SpawnDependencies): SpawnClaudeSession {
  return useCallback(async (
    optionalCwd?: string,
    options?: SpawnClaudeOptions,
  ): Promise<void> => {
    const { id, index } = nextSessionIdentity(spawnCountRef);
    const cwd = optionalCwd ?? await getDefaultCwd();
    const session: TerminalSession = {
      id,
      title: options?.label ?? `Claude ${index + 1}`,
      status: 'running',
      isClaude: true,
    };

    await spawnSessionWithLifecycle({
      session,
      setSessions,
      setActiveSessionId,
      clearKillTimers,
      onQueued: () => pendingClaudeAssocRef.current.push(id),
      start: () =>
        window.electronAPI.pty.spawnClaude(id, {
          cwd,
          initialPrompt: options?.initialPrompt,
          cliOverrides: options?.cliOverrides,
          resumeMode: options?.resumeMode,
        }),
    });
  }, [clearKillTimers, pendingClaudeAssocRef, setActiveSessionId, setSessions, spawnCountRef]);
}

export function useSessionSpawners(dependencies: SpawnDependencies): {
  spawnSession: SpawnSession;
  spawnClaudeSession: SpawnClaudeSession;
} {
  const spawnSession = useSpawnSession(dependencies);
  const spawnClaudeSession = useSpawnClaudeSession(dependencies);
  return { spawnSession, spawnClaudeSession };
}

export function useRestoreSessions({
  spawnSession,
  spawnClaudeSession,
  setSessions,
  setActiveSessionId,
  spawnCountRef,
  clearKillTimers,
}: RestoreDependencies): RestoreState {
  const [restoreState, setRestoreState] = useState<RestoreState>({
    hasCompletedRestore: false,
    persistedSessionsSeed: null,
  });
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (!hasElectronAPI()) {
      setRestoreState({ hasCompletedRestore: true, persistedSessionsSeed: null });
      return;
    }
    if (hasRestoredRef.current) return;

    hasRestoredRef.current = true;
    void restoreSessionsAsync({
      spawnSession,
      spawnClaudeSession,
      setSessions,
      setActiveSessionId,
      spawnCountRef,
      clearKillTimers,
    }).then((persistedSessionsSeed) => {
      setRestoreState({ hasCompletedRestore: true, persistedSessionsSeed });
    }).catch((error) => {
      console.error('[terminal] Failed to restore terminal sessions:', error);
      setRestoreState({ hasCompletedRestore: true, persistedSessionsSeed: null });
    });
  }, [clearKillTimers, setActiveSessionId, setSessions, spawnClaudeSession, spawnCountRef, spawnSession]);

  return restoreState;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function restoreSessionsAsync({
  spawnSession,
  spawnClaudeSession,
  setSessions,
  setActiveSessionId,
  spawnCountRef,
  clearKillTimers,
}: RestoreDependencies): Promise<string | null> {
  try {
    const savedSnapshots = await readSavedSessionSnapshots();
    const active = await withTimeout(window.electronAPI.pty.listSessions(), 5000, []);
    if (active.length > 0) {
      return reconnectSessions(active, savedSnapshots, { setSessions, setActiveSessionId, spawnCountRef, clearKillTimers });
    }

    await spawnFromSavedOrDefault(savedSnapshots, { spawnSession, spawnClaudeSession });
    return savedSnapshots.length > 0 ? serializeSavedSessionSnapshots(savedSnapshots) : null;
  } catch {
    void spawnSession();
    return null;
  }
}

function getRestoredSessionTitle(index: number, snapshot?: SavedSessionSnapshot): string {
  if (snapshot?.title) {
    return snapshot.title;
  }

  if (snapshot?.isClaude) {
    return `Claude ${index + 1}`;
  }

  return buildSessionLabel(index);
}

function restoreSessionFromSnapshot(
  activeSession: { id: string },
  index: number,
  savedSnapshot?: SavedSessionSnapshot,
): TerminalSession {
  return {
    id: activeSession.id,
    title: getRestoredSessionTitle(index, savedSnapshot),
    status: 'running',
    isClaude: savedSnapshot?.isClaude === true ? true : undefined,
    claudeSessionId: savedSnapshot?.claudeSessionId,
  };
}

function matchActiveSessionsToSavedOrder(
  active: Array<{ id: string; cwd: string }>,
  savedSnapshots: SavedSessionSnapshot[],
): Array<{ activeSession: { id: string; cwd: string }; savedSnapshot: SavedSessionSnapshot }> | null {
  if (savedSnapshots.length !== active.length) {
    return null;
  }

  const activeByCwd = new Map<string, Array<{ id: string; cwd: string }>>();
  active.forEach((session) => {
    const bucket = activeByCwd.get(session.cwd);
    if (bucket) bucket.push(session);
    else activeByCwd.set(session.cwd, [session]);
  });

  const matches = savedSnapshots.map((savedSnapshot) => {
    const bucket = activeByCwd.get(savedSnapshot.cwd);
    const activeSession = bucket?.shift();
    return activeSession ? { activeSession, savedSnapshot } : null;
  });

  if (matches.some((match) => match === null)) {
    return null;
  }

  const hasUnmatchedActiveSessions = Array.from(activeByCwd.values()).some((bucket) => bucket.length > 0);
  if (hasUnmatchedActiveSessions) {
    return null;
  }

  return matches as Array<{ activeSession: { id: string; cwd: string }; savedSnapshot: SavedSessionSnapshot }>;
}

function reconnectSessions(
  active: Array<{ id: string; cwd: string }>,
  savedSnapshots: SavedSessionSnapshot[],
  {
    setSessions,
    setActiveSessionId,
    spawnCountRef,
    clearKillTimers,
  }: Pick<RestoreDependencies, 'setSessions' | 'setActiveSessionId' | 'spawnCountRef' | 'clearKillTimers'>,
): string | null {
  const matchedSessions = matchActiveSessionsToSavedOrder(active, savedSnapshots);
  const reconnected: TerminalSession[] = matchedSessions
    ? matchedSessions.map(({ activeSession, savedSnapshot }, index) => restoreSessionFromSnapshot(activeSession, index, savedSnapshot))
    : active.map((session, index) => restoreSessionFromSnapshot(session, index));

  setSessions(reconnected);
  setActiveSessionId(reconnected[0]?.id ?? null);
  spawnCountRef.current = reconnected.length;
  reconnected.forEach((session) => registerExitHandler(session.id, setSessions, clearKillTimers));
  return matchedSessions ? serializeSavedSessionSnapshots(savedSnapshots) : null;
}

async function spawnFromSavedOrDefault(
  savedSnapshots: SavedSessionSnapshot[],
  { spawnSession, spawnClaudeSession }: Pick<RestoreDependencies, 'spawnSession' | 'spawnClaudeSession'>,
): Promise<void> {
  const autoLaunch = await window.electronAPI.config.get('claudeAutoLaunch');
  if (savedSnapshots.length === 0) {
    if (autoLaunch) void spawnClaudeSession();
    else void spawnSession();
    return;
  }

  for (const snapshot of savedSnapshots) {
    await spawnSavedSession(snapshot, autoLaunch, { spawnSession, spawnClaudeSession });
  }
}

async function spawnSavedSession(
  snapshot: SavedSessionSnapshot,
  autoLaunch: boolean,
  { spawnSession, spawnClaudeSession }: Pick<RestoreDependencies, 'spawnSession' | 'spawnClaudeSession'>,
): Promise<void> {
  if (snapshot.isClaude || autoLaunch) {
    await spawnClaudeSession(snapshot.cwd, { label: snapshot.title, resumeMode: snapshot.claudeSessionId ?? 'continue' });
    return;
  }

  await spawnSession(snapshot.cwd);
}
