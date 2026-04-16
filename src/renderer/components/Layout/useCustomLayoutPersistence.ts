/**
 * useCustomLayoutPersistence.ts — Per-session layout persistence hook (Wave 28 Phase D).
 *
 * Loads on mount, debounces saves at 250ms, exposes save(tree) and clear().
 * No-op when sessionId is empty — never pollutes config with blank keys.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SerializedSlotNode } from '../../types/electron-layout';

export interface CustomLayoutPersistence {
  savedTree: SerializedSlotNode | null;
  save: (tree: SerializedSlotNode) => void;
  clear: () => void;
}

const DEBOUNCE_MS = 250;

function hasApi(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && 'layout' in window.electronAPI;
}

export function useCustomLayoutPersistence(sessionId: string): CustomLayoutPersistence {
  const [savedTree, setSavedTree] = useState<SerializedSlotNode | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!sessionId || !hasApi()) return;
    void window.electronAPI.layout.getCustomLayout(sessionId).then((result) => {
      if (!mountedRef.current) return;
      if (result.success && result.tree !== undefined) setSavedTree(result.tree ?? null);
    });
  }, [sessionId]);

  const save = useCallback((tree: SerializedSlotNode) => {
    if (!sessionId || !hasApi()) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      void window.electronAPI.layout.setCustomLayout(sessionId, tree);
    }, DEBOUNCE_MS);
  }, [sessionId]);

  const clear = useCallback(() => {
    if (!sessionId || !hasApi()) return;
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSavedTree(null);
    void window.electronAPI.layout.deleteCustomLayout(sessionId);
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  return { savedTree, save, clear };
}
