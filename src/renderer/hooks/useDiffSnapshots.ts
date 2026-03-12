/**
 * useDiffSnapshots.ts — Captures git HEAD hash when agent sessions start.
 *
 * Watches for new running sessions and calls git:snapshot to record the
 * commit hash. This hash is later used by the diff review panel to compute
 * what changed during the session.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAgentEventsContext } from '../contexts/AgentEventsContext';
import { useProject } from '../contexts/ProjectContext';

/**
 * Returns a function to look up the snapshot hash for a given session ID.
 * Automatically captures snapshots when new sessions start running.
 */
export function useDiffSnapshots(): {
  getSnapshotHash: (sessionId: string) => string | null;
} {
  const { agents } = useAgentEventsContext();
  const { projectRoot } = useProject();
  const snapshotsRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());

  // Watch for new running sessions and snapshot them
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
        }
      }).catch(() => {
        pendingRef.current.delete(session.id);
      });
    }
  }, [agents, projectRoot]);

  const getSnapshotHash = useCallback((sessionId: string): string | null => {
    return snapshotsRef.current.get(sessionId) ?? null;
  }, []);

  return { getSnapshotHash };
}
