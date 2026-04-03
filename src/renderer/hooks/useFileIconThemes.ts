import { useEffect, useMemo, useState } from 'react';

import type { ExtensionIconThemeData } from '../types/electron';
import { FILE_ICON_THEMES_CHANGED_EVENT } from './appEventNames';

interface FileIconThemeRuntimeState {
  activeThemeId: string;
  themes: ExtensionIconThemeData[];
  hydrated: boolean;
}

const DEFAULT_STATE: FileIconThemeRuntimeState = {
  activeThemeId: '',
  themes: [],
  hydrated: false,
};

let runtimeState: FileIconThemeRuntimeState = DEFAULT_STATE;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<(state: FileIconThemeRuntimeState) => void>();

function cloneState(): FileIconThemeRuntimeState {
  return {
    activeThemeId: runtimeState.activeThemeId,
    themes: [...runtimeState.themes],
    hydrated: runtimeState.hydrated,
  };
}

function emitState(): void {
  const snapshot = cloneState();
  for (const listener of listeners) listener(snapshot);
}

function applyState(nextState: FileIconThemeRuntimeState): void {
  runtimeState = nextState;
  emitState();
}

function normalizeActiveThemeId(activeThemeId: string, themes: ExtensionIconThemeData[]): string {
  if (!activeThemeId) return '';
  return themes.some((theme) => theme.id === activeThemeId) ? activeThemeId : '';
}

async function readActiveFileIconTheme(): Promise<string> {
  try {
    const value = await window.electronAPI?.config?.get('activeFileIconTheme');
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

async function readIconThemes(): Promise<ExtensionIconThemeData[]> {
  try {
    const result = await window.electronAPI?.extensionStore?.getIconThemeContributions?.();
    return result?.success && result.iconThemes ? result.iconThemes : [];
  } catch {
    return [];
  }
}

async function hydrateRuntime(): Promise<void> {
  const [activeThemeId, themes] = await Promise.all([readActiveFileIconTheme(), readIconThemes()]);
  const normalizedThemeId = normalizeActiveThemeId(activeThemeId, themes);
  applyState({
    activeThemeId: normalizedThemeId,
    themes,
    hydrated: true,
  });
  if (activeThemeId !== normalizedThemeId) {
    try {
      await window.electronAPI?.config?.set('activeFileIconTheme', normalizedThemeId);
    } catch {
      // Ignore persistence failures when auto-clearing stale selections.
    }
  }
}

async function ensureHydratedAsync(): Promise<void> {
  ensureHydrated();
  if (hydrationPromise) {
    await hydrationPromise;
  }
}

function ensureHydrated(): void {
  if (runtimeState.hydrated || hydrationPromise) return;
  hydrationPromise = hydrateRuntime().finally(() => {
    hydrationPromise = null;
  });
}

function subscribe(listener: (state: FileIconThemeRuntimeState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let globalSubsInstalled = false;

function installGlobalSubscriptions(): void {
  if (globalSubsInstalled) return;
  globalSubsInstalled = true;
  window.electronAPI?.config?.onExternalChange((config) => {
    applyState({
      activeThemeId: normalizeActiveThemeId(config.activeFileIconTheme ?? '', runtimeState.themes),
      themes: runtimeState.themes,
      hydrated: true,
    });
  });
  window.addEventListener(FILE_ICON_THEMES_CHANGED_EVENT, () => {
    void hydrateRuntime();
  });
}

export async function setActiveFileIconTheme(themeId: string): Promise<void> {
  await ensureHydratedAsync();
  let normalizedThemeId = normalizeActiveThemeId(themeId, runtimeState.themes);
  if (themeId && !normalizedThemeId) {
    await hydrateRuntime();
    normalizedThemeId = normalizeActiveThemeId(themeId, runtimeState.themes);
  }
  applyState({
    ...runtimeState,
    activeThemeId: normalizedThemeId,
    hydrated: true,
  });
  try {
    await window.electronAPI?.config?.set('activeFileIconTheme', normalizedThemeId);
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export function notifyFileIconThemesChanged(): void {
  void hydrateRuntime();
}

export function useFileIconThemes(): {
  activeTheme: ExtensionIconThemeData | null;
  activeThemeId: string;
  themes: ExtensionIconThemeData[];
  hydrated: boolean;
  setActiveTheme: (themeId: string) => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<FileIconThemeRuntimeState>(() => cloneState());

  useEffect(() => {
    ensureHydrated();
    installGlobalSubscriptions();
    return subscribe(setSnapshot);
  }, []);

  const activeTheme = useMemo(
    () => snapshot.themes.find((theme) => theme.id === snapshot.activeThemeId) ?? null,
    [snapshot.activeThemeId, snapshot.themes],
  );

  return {
    activeTheme,
    activeThemeId: snapshot.activeThemeId,
    themes: snapshot.themes,
    hydrated: snapshot.hydrated,
    setActiveTheme: setActiveFileIconTheme,
  };
}
