/**
 * useDiffSnapshots.ts - Captures git HEAD hash when agent sessions start/end.
 *
 * Watches for new running sessions and calls git:snapshot to record the
 * commit hash. Persists snapshots to config for cross-restart survival.
 * Also exposes methods for manual snapshot creation and snapshot retrieval.
 */

import log from 'electron-log/renderer';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useAgentEventsContext } from '../contexts/AgentEventsContext';
import { useProject } from '../contexts/ProjectContext';
import type { WorkspaceSnapshot } from '../types/electron';
import {
  createManualSnapshotRecord,
  createSessionSnapshot,
  type EndedSnapshotEffectOptions,
  type EndedSnapshotOptions,
  filterSnapshotsForProject,
  getChangedFileCount,
  type RunningSnapshotEffectOptions,
  type RunningSnapshotOptions,
  shouldCaptureEndSnapshot,
  shouldCaptureStartSnapshot,
  type SnapshotMapRef,
  syncSnapshotLookup,
  upsertSnapshot,
} from './useDiffSnapshots.helpers';

const MAX_SNAPSHOTS = 100;

type SnapshotSetter = Dispatch<SetStateAction<WorkspaceSnapshot[]>>;
type PersistSnapshot = (snapshot: WorkspaceSnapshot) => Promise<void>;

async function readProjectSnapshots(
  projectRoot: string | null,
): Promise<WorkspaceSnapshot[] | null> {
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
  void setConfig('workspaceSnapshots', snapshots).catch((error) => {
    log.error('Failed to persist workspace snapshots:', error);
  });
}

async function snapshotRunningSession({
  pendingRef,
  persistSnapshot,
  projectRoot,
  session,
  snapshotsRef,
}: RunningSnapshotOptions): Promise<void> {
  const gitApi = window.electronAPI?.git;
  if (!gitApi?.snapshot || !shouldCaptureStartSnapshot(session, snapshotsRef, pendingRef)) return;

  pendingRef.current.add(session.id);
  try {
    const result = await gitApi.snapshot(projectRoot);
    if (!result.success || !result.commitHash) return;
    snapshotsRef.current.set(session.id, result.commitHash);
    await persistSnapshot(
      createSessionSnapshot({
        session,
        projectRoot,
        commitHash: result.commitHash,
        type: 'session-start',
      }),
    );
  } catch {
    // ignore
  } finally {
    pendingRef.current.delete(session.id);
  }
}

async function snapshotEndedSession({
  endedSessionsRef,
  persistSnapshot,
  projectRoot,
  session,
  snapshotsRef,
}: EndedSnapshotOptions): Promise<void> {
  const gitApi = window.electronAPI?.git;
  if (!gitApi?.snapshot || !shouldCaptureEndSnapshot(session, endedSessionsRef)) return;

  endedSessionsRef.current.add(session.id);
  try {
    const result = await gitApi.snapshot(projectRoot);
    if (!result.success || !result.commitHash) return;
    const fileCount = await getChangedFileCount(
      projectRoot,
      snapshotsRef.current.get(session.id),
      result.commitHash,
    );
    await persistSnapshot(
      createSessionSnapshot({
        session,
        projectRoot,
        commitHash: result.commitHash,
        type: 'session-end',
        fileCount,
      }),
    );
  } catch {
    // ignore
  }
}

function usePersistSnapshot(setSnapshots: SnapshotSetter): PersistSnapshot {
  return useCallback(
    async (snapshot: WorkspaceSnapshot) => {
      setSnapshots((previous) => {
        const next = upsertSnapshot(previous, snapshot, MAX_SNAPSHOTS);
        saveSnapshots(next);
        return next;
      });
    },
    [setSnapshots],
  );
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

function useRunningSessionSnapshots({
  agents,
  pendingRef,
  persistSnapshot,
  projectRoot,
  snapshotsRef,
}: RunningSnapshotEffectOptions): void {
  useEffect(() => {
    if (!projectRoot) return;
    for (const session of agents) {
      void snapshotRunningSession({
        session,
        projectRoot,
        snapshotsRef,
        pendingRef,
        persistSnapshot,
      });
    }
  }, [agents, pendingRef, persistSnapshot, projectRoot, snapshotsRef]);
}

function useEndedSessionSnapshots({
  agents,
  endedSessionsRef,
  persistSnapshot,
  projectRoot,
  snapshotsRef,
}: EndedSnapshotEffectOptions): void {
  useEffect(() => {
    if (!projectRoot) return;
    for (const session of agents) {
      void snapshotEndedSession({
        session,
        projectRoot,
        snapshotsRef,
        endedSessionsRef,
        persistSnapshot,
      });
    }
  }, [agents, endedSessionsRef, persistSnapshot, projectRoot, snapshotsRef]);
}

function useManualSnapshot(
  projectRoot: string | null,
  persistSnapshot: PersistSnapshot,
): (label?: string) => Promise<WorkspaceSnapshot | null> {
  return useCallback(
    async (label?: string) => {
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
    },
    [persistSnapshot, projectRoot],
  );
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
  useEndedSessionSnapshots({
    agents,
    projectRoot,
    snapshotsRef,
    endedSessionsRef,
    persistSnapshot,
  });

  const getSnapshotHash = useCallback(
    (sessionId: string): string | null => snapshotsRef.current.get(sessionId) ?? null,
    [],
  );
  const createManualSnapshot = useManualSnapshot(projectRoot, persistSnapshot);
  const refreshSnapshots = useRefreshSnapshots(projectRoot, setSnapshots, snapshotsRef);

  return { getSnapshotHash, snapshots, createManualSnapshot, refreshSnapshots };
}
