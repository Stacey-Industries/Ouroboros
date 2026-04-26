import { useCallback, useRef, useState } from 'react';

import type { DirEntry } from '../../types/electron';
import { resolveFolderSelection } from './WebFolderBrowserSupport';

export function buildBreadcrumbs(path: string): { label: string; path: string }[] {
  if (path === '/') return [{ label: '/', path: '/' }];
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return [
    { label: '/', path: '/' },
    ...parts.map((part, i) => ({
      label: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    })),
  ];
}

export function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx <= 0 ? '/' : normalized.slice(0, idx);
}

export interface BrowserState {
  isOpen: boolean;
  currentPath: string;
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
}

export const INITIAL_BROWSER_STATE: BrowserState = {
  isOpen: false,
  currentPath: '/',
  entries: [],
  loading: false,
  error: null,
};

export function useWebFolderBrowser() {
  const [state, setState] = useState<BrowserState>(INITIAL_BROWSER_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const navigate = useCallback(async (path: string) => {
    setState((s) => ({ ...s, currentPath: path, loading: true, error: null }));
    try {
      const result = await window.electronAPI.files.readDir(path);
      if (!result.success) {
        setState((s) => ({
          ...s,
          loading: false,
          error: result.error ?? 'Failed to read directory',
        }));
        return;
      }
      setState((s) => ({ ...s, loading: false, entries: result.items ?? [] }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  const open = useCallback(() => {
    setState((s) => ({ ...s, isOpen: true }));
    void navigate(stateRef.current.currentPath);
  }, [navigate]);

  const cancel = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
    resolveFolderSelection({ cancelled: true, path: null });
  }, []);

  const select = useCallback(() => {
    const path = stateRef.current.currentPath;
    setState((s) => ({ ...s, isOpen: false }));
    resolveFolderSelection({ cancelled: false, path });
  }, []);

  return { state, open, cancel, select, navigate };
}
