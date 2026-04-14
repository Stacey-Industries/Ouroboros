/**
 * usePersistedTerminalSessions — fetches PTY sessions persisted across the
 * previous app run and exposes restore/discard actions via IPC.
 *
 * Sessions older than 7 days are treated as stale and auto-discarded on load.
 */

import React, { useEffect, useState } from 'react';

import type { PersistedSessionInfo } from '../types/electron';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(session: PersistedSessionInfo): boolean {
  return Date.now() - session.lastSeenAt < SEVEN_DAYS_MS;
}

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface UsePersistedTerminalSessionsResult {
  sessions: PersistedSessionInfo[];
  isLoading: boolean;
  restore: (id: string) => Promise<void>;
  restoreAll: () => Promise<void>;
  discardAll: () => Promise<void>;
}

type SetSessions = React.Dispatch<React.SetStateAction<PersistedSessionInfo[]>>;

async function loadSessions(setSessions: SetSessions, setIsLoading: (v: boolean) => void): Promise<void> {
  try {
    const all = await window.electronAPI.pty.listPersistedSessions();
    const recent = all.filter(isRecent);
    if (recent.length < all.length) {
      // Stale sessions present — wipe the store and show nothing.
      await window.electronAPI.pty.discardPersistedSessions();
      setSessions([]);
    } else {
      setSessions(recent);
    }
  } catch {
    setSessions([]);
  } finally {
    setIsLoading(false);
  }
}

export function usePersistedTerminalSessions(): UsePersistedTerminalSessionsResult {
  const [sessions, setSessions] = useState<PersistedSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!hasElectronAPI()) { setIsLoading(false); return; }
    void loadSessions(setSessions, setIsLoading);
  }, []);

  async function restore(id: string): Promise<void> {
    if (!hasElectronAPI()) return;
    await window.electronAPI.pty.restoreSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function restoreAll(): Promise<void> {
    if (!hasElectronAPI()) return;
    const ids = sessions.map((s) => s.id);
    await Promise.all(ids.map((id) => window.electronAPI.pty.restoreSession(id)));
    setSessions([]);
  }

  async function discardAll(): Promise<void> {
    if (!hasElectronAPI()) return;
    await window.electronAPI.pty.discardPersistedSessions();
    setSessions([]);
  }

  return { sessions, isLoading, restore, restoreAll, discardAll };
}
