import { useCallback, useEffect, useState } from 'react';

import type { PinnedContextItem } from '../types/electron';

export interface UsePinnedContextResult {
  items: PinnedContextItem[];
  add: (item: Omit<PinnedContextItem, 'id' | 'addedAt'>) => Promise<PinnedContextItem | null>;
  remove: (itemId: string) => Promise<void>;
  dismiss: (itemId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePinnedContext(sessionId: string | null): UsePinnedContextResult {
  const [items, setItems] = useState<PinnedContextItem[]>([]);

  const refresh = useCallback(async () => {
    if (!sessionId || !window.electronAPI?.pinnedContext) return;
    const result = await window.electronAPI.pinnedContext.list(sessionId);
    if (result.success && result.items) setItems(result.items);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !window.electronAPI?.pinnedContext) return;
    void refresh();
    const cleanup = window.electronAPI.pinnedContext.onChanged((payload) => {
      if (payload.sessionId !== sessionId) return;
      setItems(payload.items.filter((p) => !p.dismissed));
    });
    return cleanup;
  }, [sessionId, refresh]);

  const add = useCallback(
    async (item: Omit<PinnedContextItem, 'id' | 'addedAt'>): Promise<PinnedContextItem | null> => {
      if (!sessionId || !window.electronAPI?.pinnedContext) return null;
      const result = await window.electronAPI.pinnedContext.add(sessionId, item);
      return result.success && result.item ? result.item : null;
    },
    [sessionId],
  );

  const remove = useCallback(
    async (itemId: string): Promise<void> => {
      if (!sessionId || !window.electronAPI?.pinnedContext) return;
      await window.electronAPI.pinnedContext.remove(sessionId, itemId);
    },
    [sessionId],
  );

  const dismiss = useCallback(
    async (itemId: string): Promise<void> => {
      if (!sessionId || !window.electronAPI?.pinnedContext) return;
      await window.electronAPI.pinnedContext.dismiss(sessionId, itemId);
    },
    [sessionId],
  );

  return { items, add, remove, dismiss, refresh };
}
