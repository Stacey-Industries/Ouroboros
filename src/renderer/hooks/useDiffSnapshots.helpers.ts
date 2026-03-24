import type { MutableRefObject } from 'react';

import type { AgentSession } from '../components/AgentMonitor/types';
import type { WorkspaceSnapshot } from '../types/electron';

export type SnapshotMapRef = MutableRefObject<Map<string, string>>;
export type SessionIdSetRef = MutableRefObject<Set<string>>;

export interface SessionSnapshotRecordOptions {
  commitHash: string;
  fileCount?: number;
  projectRoot: string;
  session: AgentSession;
  type: 'session-start' | 'session-end';
}

export interface RunningSnapshotOptions {
  pendingRef: SessionIdSetRef;
  persistSnapshot: (snapshot: WorkspaceSnapshot) => Promise<void>;
  projectRoot: string;
  session: AgentSession;
  snapshotsRef: SnapshotMapRef;
}

export interface EndedSnapshotOptions {
  endedSessionsRef: SessionIdSetRef;
  persistSnapshot: (snapshot: WorkspaceSnapshot) => Promise<void>;
  projectRoot: string;
  session: AgentSession;
  snapshotsRef: SnapshotMapRef;
}

export interface RunningSnapshotEffectOptions {
  agents: AgentSession[];
  pendingRef: SessionIdSetRef;
  persistSnapshot: (snapshot: WorkspaceSnapshot) => Promise<void>;
  projectRoot: string | null;
  snapshotsRef: SnapshotMapRef;
}

export interface EndedSnapshotEffectOptions {
  agents: AgentSession[];
  endedSessionsRef: SessionIdSetRef;
  persistSnapshot: (snapshot: WorkspaceSnapshot) => Promise<void>;
  projectRoot: string | null;
  snapshotsRef: SnapshotMapRef;
}

export function filterSnapshotsForProject(
  stored: unknown,
  projectRoot: string | null,
): WorkspaceSnapshot[] {
  if (!Array.isArray(stored)) return [];
  const snapshots = stored as WorkspaceSnapshot[];
  return snapshots.filter(
    (snapshot) => !snapshot.projectRoot || snapshot.projectRoot === projectRoot,
  );
}

export function syncSnapshotLookup(
  snapshotsRef: SnapshotMapRef,
  snapshots: WorkspaceSnapshot[],
): void {
  snapshotsRef.current = new Map(
    snapshots.map((snapshot) => [snapshot.sessionId, snapshot.commitHash]),
  );
}

export function upsertSnapshot(
  previous: WorkspaceSnapshot[],
  snapshot: WorkspaceSnapshot,
  maxSnapshots: number,
): WorkspaceSnapshot[] {
  return [snapshot, ...previous.filter((candidate) => candidate.id !== snapshot.id)].slice(
    0,
    maxSnapshots,
  );
}

export function createSessionSnapshot({
  commitHash,
  fileCount,
  projectRoot,
  session,
  type,
}: SessionSnapshotRecordOptions): WorkspaceSnapshot {
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

export function createManualSnapshotRecord(
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

export function shouldCaptureStartSnapshot(
  session: AgentSession,
  snapshotsRef: SnapshotMapRef,
  pendingRef: SessionIdSetRef,
): boolean {
  return (
    session.status === 'running' &&
    !snapshotsRef.current.has(session.id) &&
    !pendingRef.current.has(session.id)
  );
}

export function shouldCaptureEndSnapshot(
  session: AgentSession,
  endedSessionsRef: SessionIdSetRef,
): boolean {
  return (
    (session.status === 'complete' || session.status === 'error') &&
    !endedSessionsRef.current.has(session.id)
  );
}

export async function getChangedFileCount(
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
