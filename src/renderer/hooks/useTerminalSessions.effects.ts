import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useRef } from 'react';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';

export interface UseTerminalSessionsReturn {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  recordingSessions: Set<string>;
  spawnSession: (optionalCwd?: string) => Promise<void>;
  spawnClaudeSession: (optionalCwd?: string, options?: SpawnClaudeOptions) => Promise<void>;
  spawnCodexSession: (optionalCwd?: string, options?: SpawnCodexOptions) => Promise<void>;
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
  /** Provider:model override (e.g. 'minimax:MiniMax-M2.7') */
  providerModel?: string;
}

export interface SpawnCodexOptions {
  initialPrompt?: string;
  cliOverrides?: Record<string, unknown>;
  label?: string;
  resumeThreadId?: string;
  model?: string;
}

type SessionSetter = Dispatch<SetStateAction<TerminalSession[]>>;
type ActiveSessionSetter = Dispatch<SetStateAction<string | null>>;
type SpawnSession = (optionalCwd?: string) => Promise<void>;
type SpawnClaudeSession = (optionalCwd?: string, options?: SpawnClaudeOptions) => Promise<void>;
type SpawnCodexSession = (optionalCwd?: string, options?: SpawnCodexOptions) => Promise<void>;

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


interface SpawnLifecycleArgs {
  session: TerminalSession;
  start: () => Promise<unknown>;
  setSessions: SessionSetter;
  setActiveSessionId: ActiveSessionSetter;
  clearKillTimers: (id: string) => void;
  onQueued?: () => void;
}

/** Exported for use by useTerminalSessions.restore.ts */
export interface SavedSessionSnapshot {
  cwd: string;
  title?: string;
  isClaude?: boolean;
  isCodex?: boolean;
  claudeSessionId?: string;
  codexThreadId?: string;
}


export function serializeSavedSessionSnapshots(snapshots: SavedSessionSnapshot[]): string {
  return JSON.stringify(
    snapshots.map((snapshot) => ({
      cwd: snapshot.cwd,
      title: snapshot.title ?? '',
      isClaude: snapshot.isClaude === true,
      isCodex: snapshot.isCodex === true,
      claudeSessionId: snapshot.claudeSessionId ?? null,
      codexThreadId: snapshot.codexThreadId ?? null,
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
      model: options?.providerModel,
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
          providerModel: options?.providerModel,
        }),
    });
  }, [clearKillTimers, pendingClaudeAssocRef, setActiveSessionId, setSessions, spawnCountRef]);
}

function useSpawnCodexSession({
  spawnCountRef,
  setSessions,
  setActiveSessionId,
  clearKillTimers,
}: BaseSpawnDependencies): SpawnCodexSession {
  return useCallback(async (
    optionalCwd?: string,
    options?: SpawnCodexOptions,
  ): Promise<void> => {
    const { id, index } = nextSessionIdentity(spawnCountRef);
    const cwd = optionalCwd ?? await getDefaultCwd();
    const session: TerminalSession = {
      id,
      title: options?.label ?? `Codex ${index + 1}`,
      status: 'running',
      isCodex: true,
      codexThreadId: options?.resumeThreadId,
      model: options?.model,
    };

    await spawnSessionWithLifecycle({
      session,
      setSessions,
      setActiveSessionId,
      clearKillTimers,
      start: () =>
        window.electronAPI.pty.spawnCodex(id, {
          cwd,
          initialPrompt: options?.initialPrompt,
          cliOverrides: options?.cliOverrides,
          resumeThreadId: options?.resumeThreadId,
        }),
    });
  }, [clearKillTimers, setActiveSessionId, setSessions, spawnCountRef]);
}

export function useSessionSpawners(dependencies: SpawnDependencies): {
  spawnSession: SpawnSession;
  spawnClaudeSession: SpawnClaudeSession;
  spawnCodexSession: SpawnCodexSession;
} {
  const spawnSession = useSpawnSession(dependencies);
  const spawnClaudeSession = useSpawnClaudeSession(dependencies);
  const spawnCodexSession = useSpawnCodexSession(dependencies);
  return { spawnSession, spawnClaudeSession, spawnCodexSession };
}
