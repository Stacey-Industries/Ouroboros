import { useEffect, useMemo, useState } from 'react';

import type { ExtensionProductIconThemeData } from '../types/electron';
import { PRODUCT_ICON_THEMES_CHANGED_EVENT } from './appEventNames';

interface ProductIconThemeRuntimeState {
  activeThemeId: string;
  themes: ExtensionProductIconThemeData[];
  hydrated: boolean;
}

const DEFAULT_STATE: ProductIconThemeRuntimeState = {
  activeThemeId: '',
  themes: [],
  hydrated: false,
};

let runtimeState: ProductIconThemeRuntimeState = DEFAULT_STATE;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<(state: ProductIconThemeRuntimeState) => void>();

function cloneState(): ProductIconThemeRuntimeState {
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

function applyState(nextState: ProductIconThemeRuntimeState): void {
  runtimeState = nextState;
  emitState();
}

function normalizeActiveThemeId(
  activeThemeId: string,
  themes: ExtensionProductIconThemeData[],
): string {
  if (!activeThemeId) return '';
  return themes.some((theme) => theme.id === activeThemeId) ? activeThemeId : '';
}

async function readActiveProductIconTheme(): Promise<string> {
  try {
    const value = await window.electronAPI?.config?.get('activeProductIconTheme');
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

async function readProductIconThemes(): Promise<ExtensionProductIconThemeData[]> {
  try {
    const result = await window.electronAPI?.extensionStore?.getProductIconThemeContributions?.();
    return result?.success && result.productIconThemes ? result.productIconThemes : [];
  } catch {
    return [];
  }
}

async function hydrateRuntime(): Promise<void> {
  const [activeThemeId, themes] = await Promise.all([
    readActiveProductIconTheme(),
    readProductIconThemes(),
  ]);
  const normalizedThemeId = normalizeActiveThemeId(activeThemeId, themes);
  applyState({
    activeThemeId: normalizedThemeId,
    themes,
    hydrated: true,
  });
  if (activeThemeId !== normalizedThemeId) {
    try {
      await window.electronAPI?.config?.set('activeProductIconTheme', normalizedThemeId);
    } catch {
      // Ignore persistence failures when auto-clearing stale selections.
    }
  }
}

function ensureHydrated(): void {
  if (runtimeState.hydrated || hydrationPromise) return;
  hydrationPromise = hydrateRuntime().finally(() => {
    hydrationPromise = null;
  });
}

async function ensureHydratedAsync(): Promise<void> {
  ensureHydrated();
  if (hydrationPromise) {
    await hydrationPromise;
  }
}

function subscribe(listener: (state: ProductIconThemeRuntimeState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let globalSubsInstalled = false;

function installGlobalSubscriptions(): void {
  if (globalSubsInstalled) return;
  globalSubsInstalled = true;
  window.electronAPI?.config?.onExternalChange((config) => {
    applyState({
      activeThemeId: normalizeActiveThemeId(
        config.activeProductIconTheme ?? '',
        runtimeState.themes,
      ),
      themes: runtimeState.themes,
      hydrated: true,
    });
  });
  window.addEventListener(PRODUCT_ICON_THEMES_CHANGED_EVENT, () => {
    void hydrateRuntime();
  });
}

export async function setActiveProductIconTheme(themeId: string): Promise<void> {
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
    await window.electronAPI?.config?.set('activeProductIconTheme', normalizedThemeId);
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export function notifyProductIconThemesChanged(): void {
  void hydrateRuntime();
}

export function useProductIconThemes(): {
  activeTheme: ExtensionProductIconThemeData | null;
  activeThemeId: string;
  themes: ExtensionProductIconThemeData[];
  hydrated: boolean;
  setActiveTheme: (themeId: string) => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<ProductIconThemeRuntimeState>(() => cloneState());

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
    setActiveTheme: setActiveProductIconTheme,
  };
}
