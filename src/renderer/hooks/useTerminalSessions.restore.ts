import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import type { SavedSessionSnapshot, SpawnClaudeOptions, SpawnCodexOptions } from './useTerminalSessions.effects';
import {
  hasElectronAPI,
  registerExitHandler,
  serializeSavedSessionSnapshots,
} from './useTerminalSessions.effects';

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type ActiveSessionSetter = Dispatch<SetStateAction<string | null>>;
type SpawnSession = (optionalCwd?: string) => Promise<void>;
type SpawnClaudeSession = (optionalCwd?: string, options?: SpawnClaudeOptions) => Promise<void>;
type SpawnCodexSession = (optionalCwd?: string, options?: SpawnCodexOptions) => Promise<void>;

interface RestoreDependencies {
  spawnSession: SpawnSession;
  spawnClaudeSession: SpawnClaudeSession;
  spawnCodexSession: SpawnCodexSession;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  spawnCountRef: MutableRefObject<number>;
  clearKillTimers: (id: string) => void;
}

interface RestoreState {
  hasCompletedRestore: boolean;
  persistedSessionsSeed: string | null;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isSavedSessionSnapshot(value: unknown): value is SavedSessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as SavedSessionSnapshot;
  return typeof s.cwd === 'string'
    && isOptionalString(s.title) && isOptionalBoolean(s.isClaude)
    && isOptionalBoolean(s.isCodex) && isOptionalString(s.claudeSessionId)
    && isOptionalString(s.codexThreadId);
}

async function readSavedSessionSnapshots(): Promise<SavedSessionSnapshot[]> {
  const saved = await window.electronAPI.config.get('terminalSessions');
  if (!Array.isArray(saved)) return [];
  return saved.filter(isSavedSessionSnapshot);
}

export function useRestoreSessions(deps: RestoreDependencies): RestoreState {
  const [restoreState, setRestoreState] = useState<RestoreState>({
    hasCompletedRestore: false,
    persistedSessionsSeed: null,
  });
  const hasRestoredRef = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    if (!hasElectronAPI()) {
      setRestoreState({ hasCompletedRestore: true, persistedSessionsSeed: null });
      return;
    }
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    void restoreSessionsAsync(depsRef.current).then((seed) => {
      setRestoreState({ hasCompletedRestore: true, persistedSessionsSeed: seed });
    }).catch((error) => {
      console.error('[terminal] Failed to restore terminal sessions:', error);
      setRestoreState({ hasCompletedRestore: true, persistedSessionsSeed: null });
    });
  }, []);

  return restoreState;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function restoreSessionsAsync(deps: RestoreDependencies): Promise<string | null> {
  try {
    const savedSnapshots = await readSavedSessionSnapshots();
    const active = await withTimeout(window.electronAPI.pty.listSessions(), 5000, []);
    if (active.length > 0) {
      return reconnectSessions(active, savedSnapshots, deps);
    }
    await spawnFromSavedOrDefault(savedSnapshots, deps);
    return savedSnapshots.length > 0 ? serializeSavedSessionSnapshots(savedSnapshots) : null;
  } catch {
    void deps.spawnSession();
    return null;
  }
}

function buildSessionLabel(index: number): string {
  return `Terminal ${index + 1}`;
}

function getRestoredSessionTitle(index: number, snapshot?: SavedSessionSnapshot): string {
  if (snapshot?.title) return snapshot.title;
  if (snapshot?.isClaude) return `Claude ${index + 1}`;
  if (snapshot?.isCodex) return `Codex ${index + 1}`;
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
    isCodex: savedSnapshot?.isCodex === true ? true : undefined,
    claudeSessionId: savedSnapshot?.claudeSessionId,
    codexThreadId: savedSnapshot?.codexThreadId,
  };
}

function matchActiveSessionsToSavedOrder(
  active: Array<{ id: string; cwd: string }>,
  savedSnapshots: SavedSessionSnapshot[],
): Array<{ activeSession: { id: string; cwd: string }; savedSnapshot: SavedSessionSnapshot }> | null {
  if (savedSnapshots.length !== active.length) return null;

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

  if (matches.some((match) => match === null)) return null;
  const hasUnmatched = Array.from(activeByCwd.values()).some((bucket) => bucket.length > 0);
  if (hasUnmatched) return null;

  return matches as Array<{ activeSession: { id: string; cwd: string }; savedSnapshot: SavedSessionSnapshot }>;
}

function reconnectSessions(
  active: Array<{ id: string; cwd: string }>,
  savedSnapshots: SavedSessionSnapshot[],
  deps: Pick<RestoreDependencies, 'setSessions' | 'setActiveSessionId' | 'spawnCountRef' | 'clearKillTimers'>,
): string | null {
  const matchedSessions = matchActiveSessionsToSavedOrder(active, savedSnapshots);
  const reconnected: TerminalSession[] = matchedSessions
    ? matchedSessions.map(({ activeSession, savedSnapshot }, i) => restoreSessionFromSnapshot(activeSession, i, savedSnapshot))
    : active.map((session, i) => restoreSessionFromSnapshot(session, i));

  deps.setSessions(reconnected);
  deps.setActiveSessionId(reconnected[0]?.id ?? null);
  deps.spawnCountRef.current = reconnected.length;
  reconnected.forEach((s) => registerExitHandler(s.id, deps.setSessions, deps.clearKillTimers));
  return matchedSessions ? serializeSavedSessionSnapshots(savedSnapshots) : null;
}

async function spawnFromSavedOrDefault(
  savedSnapshots: SavedSessionSnapshot[],
  deps: Pick<RestoreDependencies, 'spawnSession' | 'spawnClaudeSession' | 'spawnCodexSession'>,
): Promise<void> {
  const autoLaunch = await window.electronAPI.config.get('claudeAutoLaunch');
  if (savedSnapshots.length === 0) {
    if (autoLaunch) void deps.spawnClaudeSession();
    else void deps.spawnSession();
    return;
  }
  for (const snapshot of savedSnapshots) {
    await spawnSavedSession(snapshot, autoLaunch, deps);
  }
}

async function spawnSavedSession(
  snapshot: SavedSessionSnapshot,
  autoLaunch: boolean,
  deps: Pick<RestoreDependencies, 'spawnSession' | 'spawnClaudeSession' | 'spawnCodexSession'>,
): Promise<void> {
  if (snapshot.isClaude || autoLaunch) {
    await deps.spawnClaudeSession(snapshot.cwd, { label: snapshot.title, resumeMode: snapshot.claudeSessionId ?? 'continue' });
    return;
  }
  if (snapshot.isCodex) {
    await deps.spawnCodexSession(snapshot.cwd, { label: snapshot.title, resumeThreadId: snapshot.codexThreadId });
    return;
  }
  await deps.spawnSession(snapshot.cwd);
}
