/**
 * useDiffSnapshots.ts - Captures git HEAD hash when agent sessions start/end.
 *
 * Watches for new running sessions and calls git:snapshot to record the
 * commit hash. Persists snapshots to config for cross-restart survival.
 * Also exposes methods for manual snapshot creation and snapshot retrieval.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { AgentSession } from '../components/AgentMonitor/types';
import { useAgentEventsContext } from '../contexts/AgentEventsContext';
import { useProject } from '../contexts/ProjectContext';
import type { WorkspaceSnapshot } from '../types/electron';

const MAX_SNAPSHOTS = 100;

type SnapshotMapRef = MutableRefObject<Map<string, string>>;
type SessionIdSetRef = MutableRefObject<Set<string>>;
type SnapshotSetter = Dispatch<SetStateAction<WorkspaceSnapshot[]>>;
type PersistSnapshot = (snapshot: WorkspaceSnapshot) => Promise<void>;

interface SessionSnapshotRecordOptions {
  commitHash: string;
  fileCount?: number;
  projectRoot: string;
  session: AgentSession;
  type: 'session-start' | 'session-end';
}

interface RunningSnapshotOptions {
  pendingRef: SessionIdSetRef;
  persistSnapshot: PersistSnapshot;
  projectRoot: string;
  session: AgentSession;
  snapshotsRef: SnapshotMapRef;
}

interface EndedSnapshotOptions {
  endedSessionsRef: SessionIdSetRef;
  persistSnapshot: PersistSnapshot;
  projectRoot: string;
  session: AgentSession;
  snapshotsRef: SnapshotMapRef;
}

interface RunningSnapshotEffectOptions {
  agents: AgentSession[];
  pendingRef: SessionIdSetRef;
  persistSnapshot: PersistSnapshot;
  projectRoot: string | null;
  snapshotsRef: SnapshotMapRef;
}

interface EndedSnapshotEffectOptions {
  agents: AgentSession[];
  endedSessionsRef: SessionIdSetRef;
  persistSnapshot: PersistSnapshot;
  projectRoot: string | null;
  snapshotsRef: SnapshotMapRef;
}

function filterSnapshotsForProject(
  stored: unknown,
  projectRoot: string | null,
): WorkspaceSnapshot[] {
  if (!Array.isArray(stored)) return [];
  const snapshots = stored as WorkspaceSnapshot[];
  return snapshots.filter((snapshot) => !snapshot.projectRoot || snapshot.projectRoot === projectRoot);
}

function syncSnapshotLookup(snapshotsRef: SnapshotMapRef, snapshots: WorkspaceSnapshot[]): void {
  snapshotsRef.current = new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot.commitHash]));
}

async function readProjectSnapshots(projectRoot: string | null): Promise<WorkspaceSnapshot[] | null> {
  const getConfig = window.electronAPI?.config?.get;
  if (!getConfig) return null;
  const stored = await getConfig('workspaceSnapshots');
  return filterSnapshotsForProject(stored, projectRoot);
}

async function loadSnapshots(
  projectRoot: string | null,
  setSnapshots: SnapshotSetter,
  snapshotsRef: SnapshotMapRef,
): Promise<void> {
  try {
    const snapshots = await readProjectSnapshots(projectRoot);
    if (!snapshots) return;
    setSnapshots(snapshots);
    syncSnapshotLookup(snapshotsRef, snapshots);
  } catch {
    // ignore
  }
}

function saveSnapshots(snapshots: WorkspaceSnapshot[]): void {
  const setConfig = window.electronAPI?.config?.set;
  if (!setConfig) return;
  void setConfig('workspaceSnapshots', snapshots).catch((error) => { console.error('[diffSnapshots] Failed to persist workspace snapshots:', error) });
}

function upsertSnapshot(
  previous: WorkspaceSnapshot[],
  snapshot: WorkspaceSnapshot,
): WorkspaceSnapshot[] {
  return [snapshot, ...previous.filter((candidate) => candidate.id !== snapshot.id)].slice(0, MAX_SNAPSHOTS);
}

function createSessionSnapshot(
  { commitHash, fileCount, projectRoot, session, type }: SessionSnapshotRecordOptions,
): WorkspaceSnapshot {
  return {
    id: `${session.id}-${type === 'session-start' ? 'start' : 'end'}`,
    commitHash,
    sessionId: session.id,
    sessionLabel: session.taskLabel,
    timestamp: Date.now(),
    type,
    fileCount,
    projectRoot,
  };
}

function createManualSnapshotRecord(
  projectRoot: string,
  commitHash: string,
  label?: string,
): WorkspaceSnapshot {
  return {
    id: `manual-${Date.now()}`,
    commitHash,
    sessionId: 'manual',
    sessionLabel: label || 'Manual snapshot',
    timestamp: Date.now(),
    type: 'manual',
    projectRoot,
  };
}

function shouldCaptureStartSnapshot(
  session: AgentSession,
  snapshotsRef: SnapshotMapRef,
  pendingRef: SessionIdSetRef,
): boolean {
  return session.status === 'running'
    && !snapshotsRef.current.has(session.id)
    && !pendingRef.current.has(session.id);
}

function shouldCaptureEndSnapshot(session: AgentSession, endedSessionsRef: SessionIdSetRef): boolean {
  return (session.status === 'complete' || session.status === 'error')
    && !endedSessionsRef.current.has(session.id);
}

async function getChangedFileCount(
  projectRoot: string,
  startHash: string | undefined,
  endHash: string,
): Promise<number | undefined> {
  const gitApi = window.electronAPI?.git;
  if (!gitApi?.changedFilesBetween || !startHash || startHash === endHash) return undefined;

  try {
    const changed = await gitApi.changedFilesBetween(projectRoot, startHash, endHash);
    return changed.success && changed.files ? changed.files.length : undefined;
  } catch {
    return undefined;
  }
}

async function snapshotRunningSession(
  { pendingRef, persistSnapshot, projectRoot, session, snapshotsRef }: RunningSnapshotOptions,
): Promise<void> {
  const gitApi = window.electronAPI?.git;
  if (!gitApi?.snapshot || !shouldCaptureStartSnapshot(session, snapshotsRef, pendingRef)) return;

  pendingRef.current.add(session.id);
  try {
    const result = await gitApi.snapshot(projectRoot);
    if (!result.success || !result.commitHash) return;
    snapshotsRef.current.set(session.id, result.commitHash);
    await persistSnapshot(createSessionSnapshot({ session, projectRoot, commitHash: result.commitHash, type: 'session-start' }));
  } catch {
    // ignore
  } finally {
    pendingRef.current.delete(session.id);
  }
}

async function snapshotEndedSession(
  { endedSessionsRef, persistSnapshot, projectRoot, session, snapshotsRef }: EndedSnapshotOptions,
): Promise<void> {
  const gitApi = window.electronAPI?.git;
  if (!gitApi?.snapshot || !shouldCaptureEndSnapshot(session, endedSessionsRef)) return;

  endedSessionsRef.current.add(session.id);
  try {
    const result = await gitApi.snapshot(projectRoot);
    if (!result.success || !result.commitHash) return;
    const fileCount = await getChangedFileCount(projectRoot, snapshotsRef.current.get(session.id), result.commitHash);
    await persistSnapshot(createSessionSnapshot({
      session,
      projectRoot,
      commitHash: result.commitHash,
      type: 'session-end',
      fileCount,
    }));
  } catch {
    // ignore
  }
}

function usePersistSnapshot(setSnapshots: SnapshotSetter): PersistSnapshot {
  return useCallback(async (snapshot: WorkspaceSnapshot) => {
    setSnapshots((previous) => {
      const next = upsertSnapshot(previous, snapshot);
      saveSnapshots(next);
      return next;
    });
  }, [setSnapshots]);
}

function usePersistedProjectSnapshots(
  projectRoot: string | null,
  setSnapshots: SnapshotSetter,
  snapshotsRef: SnapshotMapRef,
): void {
  useEffect(() => {
    void loadSnapshots(projectRoot, setSnapshots, snapshotsRef);
  }, [projectRoot, setSnapshots, snapshotsRef]);
}

function useRunningSessionSnapshots(
  { agents, pendingRef, persistSnapshot, projectRoot, snapshotsRef }: RunningSnapshotEffectOptions,
): void {
  useEffect(() => {
    if (!projectRoot) return;
    for (const session of agents) {
      void snapshotRunningSession({ session, projectRoot, snapshotsRef, pendingRef, persistSnapshot });
    }
  }, [agents, pendingRef, persistSnapshot, projectRoot, snapshotsRef]);
}

function useEndedSessionSnapshots(
  { agents, endedSessionsRef, persistSnapshot, projectRoot, snapshotsRef }: EndedSnapshotEffectOptions,
): void {
  useEffect(() => {
    if (!projectRoot) return;
    for (const session of agents) {
      void snapshotEndedSession({ session, projectRoot, snapshotsRef, endedSessionsRef, persistSnapshot });
    }
  }, [agents, endedSessionsRef, persistSnapshot, projectRoot, snapshotsRef]);
}

function useManualSnapshot(
  projectRoot: string | null,
  persistSnapshot: PersistSnapshot,
): (label?: string) => Promise<WorkspaceSnapshot | null> {
  return useCallback(async (label?: string) => {
    const gitApi = window.electronAPI?.git;
    if (!projectRoot || !gitApi?.createSnapshot) return null;

    try {
      const result = await gitApi.createSnapshot(projectRoot, label);
      if (!result.success || !result.commitHash) return null;
      const snapshot = createManualSnapshotRecord(projectRoot, result.commitHash, label);
      await persistSnapshot(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }, [persistSnapshot, projectRoot]);
}

function useRefreshSnapshots(
  projectRoot: string | null,
  setSnapshots: SnapshotSetter,
  snapshotsRef: SnapshotMapRef,
): () => Promise<void> {
  return useCallback(async () => {
    await loadSnapshots(projectRoot, setSnapshots, snapshotsRef);
  }, [projectRoot, setSnapshots, snapshotsRef]);
}

/**
 * Returns functions to look up snapshot hashes, create manual snapshots,
 * and get the full persisted snapshot list. Automatically captures
 * snapshots when sessions start and end.
 */
export function useDiffSnapshots(): {
  getSnapshotHash: (sessionId: string) => string | null;
  snapshots: WorkspaceSnapshot[];
  createManualSnapshot: (label?: string) => Promise<WorkspaceSnapshot | null>;
  refreshSnapshots: () => Promise<void>;
} {
  const { agents } = useAgentEventsContext();
  const { projectRoot } = useProject();
  const snapshotsRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const endedSessionsRef = useRef<Set<string>>(new Set());
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const persistSnapshot = usePersistSnapshot(setSnapshots);

  usePersistedProjectSnapshots(projectRoot, setSnapshots, snapshotsRef);
  useRunningSessionSnapshots({ agents, projectRoot, snapshotsRef, pendingRef, persistSnapshot });
  useEndedSessionSnapshots({ agents, projectRoot, snapshotsRef, endedSessionsRef, persistSnapshot });

  const getSnapshotHash = useCallback((sessionId: string): string | null => snapshotsRef.current.get(sessionId) ?? null, []);
  const createManualSnapshot = useManualSnapshot(projectRoot, persistSnapshot);
  const refreshSnapshots = useRefreshSnapshots(projectRoot, setSnapshots, snapshotsRef);

  return { getSnapshotHash, snapshots, createManualSnapshot, refreshSnapshots };
}
