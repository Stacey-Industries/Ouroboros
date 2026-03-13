/**
 * useDiffSnapshots.ts — Captures git HEAD hash when agent sessions start/end.
 *
 * Watches for new running sessions and calls git:snapshot to record the
 * commit hash. Persists snapshots to config for cross-restart survival.
 * Also exposes methods for manual snapshot creation and snapshot retrieval.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAgentEventsContext } from '../contexts/AgentEventsContext';
import { useProject } from '../contexts/ProjectContext';
import type { WorkspaceSnapshot } from '../types/electron';

const MAX_SNAPSHOTS = 100;

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

  // Load persisted snapshots on mount and when projectRoot changes
  useEffect(() => {
    if (!window.electronAPI?.config?.get) return;
    void window.electronAPI.config.get('workspaceSnapshots').then((stored) => {
      if (Array.isArray(stored)) {
        // Filter to snapshots belonging to this project.
        // Legacy snapshots without projectRoot are shown in all projects.
        const filtered = stored.filter(
          (s: WorkspaceSnapshot) => !s.projectRoot || s.projectRoot === projectRoot
        );
        setSnapshots(filtered);
        // Populate the ref map for fast lookup
        for (const s of filtered) {
          snapshotsRef.current.set(s.sessionId, s.commitHash);
        }
      }
    }).catch(() => {});
  }, [projectRoot]);

  const persistSnapshot = useCallback(async (snapshot: WorkspaceSnapshot) => {
    setSnapshots((prev) => {
      const next = [snapshot, ...prev.filter((s) => s.id !== snapshot.id)].slice(0, MAX_SNAPSHOTS);
      // Persist asynchronously
      void window.electronAPI?.config?.set('workspaceSnapshots', next).catch(() => {});
      return next;
    });
  }, []);

  // Watch for new running sessions and snapshot them (session-start)
  useEffect(() => {
    if (!projectRoot) return;

    for (const session of agents) {
      if (session.status !== 'running') continue;
      if (snapshotsRef.current.has(session.id)) continue;
      if (pendingRef.current.has(session.id)) continue;

      pendingRef.current.add(session.id);

      void window.electronAPI.git.snapshot(projectRoot).then((result) => {
        pendingRef.current.delete(session.id);
        if (result.success && result.commitHash) {
          snapshotsRef.current.set(session.id, result.commitHash);
          const snapshot: WorkspaceSnapshot = {
            id: `${session.id}-start`,
            commitHash: result.commitHash,
            sessionId: session.id,
            sessionLabel: session.taskLabel,
            timestamp: Date.now(),
            type: 'session-start',
            projectRoot,
          };
          void persistSnapshot(snapshot);
        }
      }).catch(() => {
        pendingRef.current.delete(session.id);
      });
    }
  }, [agents, projectRoot, persistSnapshot]);

  // Watch for sessions that complete and snapshot them (session-end)
  useEffect(() => {
    if (!projectRoot) return;

    for (const session of agents) {
      if (session.status !== 'complete' && session.status !== 'error') continue;
      if (endedSessionsRef.current.has(session.id)) continue;

      endedSessionsRef.current.add(session.id);

      void window.electronAPI.git.snapshot(projectRoot).then(async (result) => {
        if (result.success && result.commitHash) {
          // Count files changed since session start
          let fileCount: number | undefined;
          const startHash = snapshotsRef.current.get(session.id);
          if (startHash && startHash !== result.commitHash) {
            try {
              const changed = await window.electronAPI.git.changedFilesBetween(projectRoot, startHash, result.commitHash);
              if (changed.success && changed.files) {
                fileCount = changed.files.length;
              }
            } catch {
              // ignore
            }
          }

          const snapshot: WorkspaceSnapshot = {
            id: `${session.id}-end`,
            commitHash: result.commitHash,
            sessionId: session.id,
            sessionLabel: session.taskLabel,
            timestamp: Date.now(),
            type: 'session-end',
            fileCount,
            projectRoot,
          };
          void persistSnapshot(snapshot);
        }
      }).catch(() => {});
    }
  }, [agents, projectRoot, persistSnapshot]);

  const getSnapshotHash = useCallback((sessionId: string): string | null => {
    return snapshotsRef.current.get(sessionId) ?? null;
  }, []);

  const createManualSnapshot = useCallback(async (label?: string): Promise<WorkspaceSnapshot | null> => {
    if (!projectRoot) return null;
    try {
      const result = await window.electronAPI.git.createSnapshot(projectRoot, label);
      if (!result.success || !result.commitHash) return null;

      const snapshot: WorkspaceSnapshot = {
        id: `manual-${Date.now()}`,
        commitHash: result.commitHash,
        sessionId: 'manual',
        sessionLabel: label || 'Manual snapshot',
        timestamp: Date.now(),
        type: 'manual',
        projectRoot: projectRoot || undefined,
      };
      await persistSnapshot(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }, [projectRoot, persistSnapshot]);

  const refreshSnapshots = useCallback(async () => {
    if (!window.electronAPI?.config?.get) return;
    try {
      const stored = await window.electronAPI.config.get('workspaceSnapshots');
      if (Array.isArray(stored)) {
        const filtered = stored.filter(
          (s: WorkspaceSnapshot) => !s.projectRoot || s.projectRoot === projectRoot
        );
        setSnapshots(filtered);
      }
    } catch {
      // ignore
    }
  }, [projectRoot]);

  return { getSnapshotHash, snapshots, createManualSnapshot, refreshSnapshots };
}
