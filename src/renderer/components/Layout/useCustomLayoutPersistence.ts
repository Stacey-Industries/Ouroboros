/**
 * useCustomLayoutPersistence.ts — Per-session layout persistence hook (Wave 28 Phase D).
 *
 * Loads on mount, debounces saves at 250ms, exposes save(tree) and clear().
 * No-op when sessionId is empty — never pollutes config with blank keys.
 */

import { type MutableRefObject,useCallback, useEffect, useRef, useState } from 'react';

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

function loadCustomLayout(
  sessionId: string,
  mountedRef: MutableRefObject<boolean>,
  setSavedTree: (tree: SerializedSlotNode | null) => void,
): void {
  if (!sessionId || !hasApi()) return;
  void window.electronAPI.layout.getCustomLayout(sessionId).then((result) => {
    if (mountedRef.current && result.success && result.tree !== undefined) {
      setSavedTree(result.tree ?? null);
    }
  });
}

function saveCustomLayout(
  sessionId: string,
  mountedRef: MutableRefObject<boolean>,
  debounceRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  tree: SerializedSlotNode,
): void {
  if (!sessionId || !hasApi()) return;
  if (debounceRef.current !== null) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    if (!mountedRef.current) return;
    void window.electronAPI.layout.setCustomLayout(sessionId, tree);
  }, DEBOUNCE_MS);
}

function clearCustomLayout(
  sessionId: string,
  debounceRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setSavedTree: (tree: SerializedSlotNode | null) => void,
): void {
  if (!sessionId || !hasApi()) return;
  if (debounceRef.current !== null) {
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }
  setSavedTree(null);
  void window.electronAPI.layout.deleteCustomLayout(sessionId);
}

export function useCustomLayoutPersistence(sessionId: string): CustomLayoutPersistence {
  const [savedTree, setSavedTree] = useState<SerializedSlotNode | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadCustomLayout(sessionId, mountedRef, setSavedTree);
  }, [sessionId]);

  const save = useCallback(
    (tree: SerializedSlotNode) => {
      saveCustomLayout(sessionId, mountedRef, debounceRef, tree);
    },
    [sessionId],
  );

  const clear = useCallback(() => {
    clearCustomLayout(sessionId, debounceRef, setSavedTree);
  }, [sessionId]);

  useEffect(() => () => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
  }, []);

  return { savedTree, save, clear };
}
