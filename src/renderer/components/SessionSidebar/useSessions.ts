/**
 * useSessions — React hook for the session store (Wave 20 Phase A).
 *
 * Loads sessions via window.electronAPI.sessionCrud.list() and subscribes
 * to sessionCrud:changed push events for live updates.
 *
 * Returns { sessions, activeSessionId, isLoading, refresh }.
 */

import { useCallback, useEffect, useState } from 'react';

import type { SessionRecord } from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseSessionsResult {
  sessions: SessionRecord[];
  activeSessionId: string | null;
  isLoading: boolean;
  refresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

async function fetchSessions(): Promise<SessionRecord[]> {
  if (!hasElectronAPI()) return [];
  const result = await window.electronAPI.sessionCrud.list();
  return result.success && result.sessions ? result.sessions : [];
}

async function fetchActiveId(): Promise<string | null> {
  if (!hasElectronAPI()) return null;
  const result = await window.electronAPI.sessionCrud.active();
  return result.success ? (result.sessionId ?? null) : null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    const [fetched, activeId] = await Promise.all([fetchSessions(), fetchActiveId()]);
    setSessions(fetched);
    setActiveSessionId(activeId);
    setIsLoading(false);
  }, []);

  const refresh = useCallback((): void => {
    void load();
  }, [load]);

  // Initial load.
  useEffect(() => {
    void load();
  }, [load]);

  // Subscribe to live store mutations.
  useEffect(() => {
    if (!hasElectronAPI()) return;
    const cleanup = window.electronAPI.sessionCrud.onChanged((updated) => {
      setSessions(updated);
    });
    return cleanup;
  }, []);

  return { sessions, activeSessionId, isLoading, refresh };
}
