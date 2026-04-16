/**
 * useFolders — React hook for the folder store (Wave 21 Phase D).
 *
 * Loads folders via window.electronAPI.folderCrud.list() and subscribes
 * to folderCrud:changed push events for live updates.
 *
 * Returns { folders, isLoading, refresh }.
 */

import { useCallback, useEffect, useState } from 'react';

import type { SessionFolder } from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseFoldersResult {
  folders: SessionFolder[];
  isLoading: boolean;
  refresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

async function fetchFolders(): Promise<SessionFolder[]> {
  if (!hasElectronAPI()) return [];
  const result = await window.electronAPI.folderCrud.list();
  return result.success && result.folders ? result.folders : [];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFolders(): UseFoldersResult {
  const [folders, setFolders] = useState<SessionFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    const fetched = await fetchFolders();
    setFolders(fetched);
    setIsLoading(false);
  }, []);

  const refresh = useCallback((): void => {
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasElectronAPI()) return;
    const cleanup = window.electronAPI.folderCrud.onChanged((updated) => {
      setFolders(updated);
    });
    return cleanup;
  }, []);

  return { folders, isLoading, refresh };
}
