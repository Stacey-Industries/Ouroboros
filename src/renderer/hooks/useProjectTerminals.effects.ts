/**
 * useProjectTerminals.effects.ts — Wave 94 Phase B
 *
 * State and persistence side-effects for useProjectTerminals.
 * Split from the main file to stay under ESLint line limits.
 *
 * Exports:
 *   useProjectTerminalsMap  — reads persisted map from electron-store on mount,
 *                             owns the in-memory Map state, exposes setProjectState.
 *   useProjectTerminalsPersist — writes the map to electron-store on change.
 */

import { useCallback, useEffect, useState } from 'react';

import type {
  ProjectTerminalState,
  TerminalSessionsPerProject,
} from '../../shared/config/projectTerminalsSchema';
import {
  parseTerminalSessionsPerProject,
  readProjectState,
} from '../../shared/config/projectTerminalsSchema';

// ---------------------------------------------------------------------------
// Config bridge helpers — guarded for test environments without electronAPI
// ---------------------------------------------------------------------------

async function loadPersistedMap(): Promise<TerminalSessionsPerProject> {
  if (typeof window === 'undefined' || !('electronAPI' in window)) return {};
  try {
    const raw = await window.electronAPI.config.get('terminalSessionsPerProject');
    return parseTerminalSessionsPerProject(raw);
  } catch {
    return {};
  }
}

function persistMap(map: TerminalSessionsPerProject): void {
  if (typeof window === 'undefined' || !('electronAPI' in window)) return;
  void window.electronAPI.config.set('terminalSessionsPerProject', map);
}

// ---------------------------------------------------------------------------
// useProjectTerminalsMap
// ---------------------------------------------------------------------------

export interface ProjectTerminalsMapApi {
  map: TerminalSessionsPerProject;
  setProjectState: (projectPath: string, patch: Partial<ProjectTerminalState>) => void;
}

export function useProjectTerminalsMap(activeProjectPath: string | null): ProjectTerminalsMapApi {
  const [map, setMap] = useState<TerminalSessionsPerProject>({});

  // Cold-boot: load from electron-store once on mount.
  useEffect(() => {
    void loadPersistedMap().then((loaded) => {
      setMap(loaded);
    });
  }, []);

  // When the active project changes and has no entry yet, seed an empty entry
  // so consumers get a stable (non-undefined) state immediately.
  useEffect(() => {
    if (!activeProjectPath) return;
    setMap((prev) => {
      if (prev[activeProjectPath]) return prev;
      return { ...prev, [activeProjectPath]: readProjectState(prev, activeProjectPath) };
    });
  }, [activeProjectPath]);

  const setProjectState = useCallback(
    (projectPath: string, patch: Partial<ProjectTerminalState>): void => {
      setMap((prev) => {
        const current = readProjectState(prev, projectPath);
        return { ...prev, [projectPath]: { ...current, ...patch } };
      });
    },
    [],
  );

  return { map, setProjectState };
}

// ---------------------------------------------------------------------------
// useProjectTerminalsPersist — debounced write to electron-store
// ---------------------------------------------------------------------------

const PERSIST_DEBOUNCE_MS = 300;

export function useProjectTerminalsPersist(map: TerminalSessionsPerProject): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      persistMap(map);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [map]);
}
