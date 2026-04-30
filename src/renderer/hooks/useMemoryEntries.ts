/**
 * useMemoryEntries.ts — Subscribes to the live list of project memory entries.
 *
 * Fetches via memory:list IPC and re-fetches whenever the watcher emits
 * memory:changed. Returns an empty array when the API is unavailable or the
 * project has no MEMORY.md.
 */

import { useEffect, useState } from 'react';

import type { MemoryEntry } from '../types/electron-memory';

export function useMemoryEntries(projectRoot: string | null | undefined): MemoryEntry[] {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);

  useEffect(() => {
    const api = window.electronAPI?.memory;
    if (!api?.list) return;

    let cancelled = false;

    const refetch = (): void => {
      void api.list(projectRoot ?? undefined).then((res) => {
        if (!cancelled && res.success) setEntries(res.entries ?? []);
      });
    };

    refetch();

    const off = api.onChanged?.(refetch);

    return () => {
      cancelled = true;
      off?.();
    };
  }, [projectRoot]);

  return entries;
}
