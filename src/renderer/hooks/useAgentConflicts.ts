/**
 * useAgentConflicts.ts — Subscribe to agentConflict:change push events.
 *
 * Returns conflict reports filtered to the current session (either sessionA
 * or sessionB matches). Pass `undefined` to receive all reports.
 */

import type { AgentConflictReport, AgentConflictSnapshot } from '@shared/types/agentConflict';
import { useEffect, useState } from 'react';

export interface UseAgentConflictsResult {
  reports: AgentConflictReport[];
  snapshot: AgentConflictSnapshot | null;
}

export function useAgentConflicts(sessionId: string | undefined): UseAgentConflictsResult {
  const [snapshot, setSnapshot] = useState<AgentConflictSnapshot | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.agentConflict;
    if (!api) return;

    // Fetch initial state
    void api.getReports().then((result) => {
      if (result.success && result.snapshot) {
        setSnapshot(result.snapshot);
      }
    });

    const cleanup = api.onChange((incoming) => {
      setSnapshot(incoming);
    });

    return cleanup;
  }, []);

  const reports = snapshot?.reports.filter((r) => {
    if (!sessionId) return true;
    return r.sessionA === sessionId || r.sessionB === sessionId;
  }) ?? [];

  return { reports, snapshot };
}
