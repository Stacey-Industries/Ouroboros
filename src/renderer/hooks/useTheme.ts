import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { customTheme, defaultThemeId, getTheme, registerExtensionTheme, themeList, themes, unregisterExtensionTheme } from '../themes';
import type { AppConfig, AppTheme } from '../types/electron';
import { applyFontConfig, applyThemeToDom, updateTitleBarOverlay } from './useTheme.tokens';

export { applyFontConfig, brightenIfDark } from './useTheme.tokens';

/** Merge saved custom color overrides into the mutable customTheme object. */
export function applyCustomThemeColors(colors: Record<string, string>): void {
  const root = document.documentElement;
  Object.assign(customTheme.colors, colors);
  for (const [cssVar, value] of Object.entries(colors)) {
    root.style.setProperty(cssVar, value);
  }
}

interface ThemeRuntimeState {
  themeId: string;
  showBgGradient: boolean;
  glassOpacity: number;
  customThemeColors: Record<string, string>;
  fontUI: string;
  fontMono: string;
  fontSizeUI: number;
  hydrated: boolean;
}

type ThemeBootstrapConfig = Pick<
  AppConfig,
  'activeTheme' | 'showBgGradient' | 'glassOpacity' | 'customThemeColors' | 'fontUI' | 'fontMono' | 'fontSizeUI'
>;

const DEFAULT_BOOTSTRAP_CONFIG: ThemeBootstrapConfig = {
  activeTheme: defaultThemeId,
  showBgGradient: true,
  glassOpacity: 0,
  customThemeColors: {},
  fontUI: '',
  fontMono: '',
  fontSizeUI: 13,
};

let runtimeState: ThemeRuntimeState = {
  themeId: defaultThemeId,
  showBgGradient: true,
  glassOpacity: 0,
  customThemeColors: {},
  fontUI: '',
  fontMono: '',
  fontSizeUI: 13,
  hydrated: false,
};

const runtimeListeners = new Set<(state: ThemeRuntimeState) => void>();
let hydrationPromise: Promise<void> | null = null;
let themeChangeCleanup: (() => void) | null = null;

function cloneRuntimeState(): ThemeRuntimeState {
  return {
    themeId: runtimeState.themeId,
    showBgGradient: runtimeState.showBgGradient,
    customThemeColors: { ...runtimeState.customThemeColors },
    fontUI: runtimeState.fontUI,
    fontMono: runtimeState.fontMono,
    fontSizeUI: runtimeState.fontSizeUI,
    hydrated: runtimeState.hydrated,
  };
}

function emitRuntimeState(): void {
  const snapshot = cloneRuntimeState();
  for (const listener of runtimeListeners) {
    listener(snapshot);
  }
}

function isValidThemeId(id: string): boolean {
  return id in themes || id.startsWith('ext:');
}

function resolveActiveTheme(raw: string | undefined): string {
  return raw && isValidThemeId(raw) ? raw : DEFAULT_BOOTSTRAP_CONFIG.activeTheme;
}

function normalizeBootstrapConfig(config?: Partial<ThemeBootstrapConfig> | null): ThemeBootstrapConfig {
  const d = DEFAULT_BOOTSTRAP_CONFIG;
  const c = config ?? {};
  return {
    activeTheme: resolveActiveTheme(c.activeTheme),
    showBgGradient: c.showBgGradient ?? d.showBgGradient,
    glassOpacity: c.glassOpacity ?? d.glassOpacity,
    customThemeColors: c.customThemeColors ?? d.customThemeColors,
    fontUI: c.fontUI ?? d.fontUI,
    fontMono: c.fontMono ?? d.fontMono,
    fontSizeUI: c.fontSizeUI ?? d.fontSizeUI,
  };
}

async function readThemeBootstrapConfig(): Promise<ThemeBootstrapConfig> {
  try {
    const api = window.electronAPI;
    if (api?.config?.getAll) {
      const stored = await api.config.getAll();
      return normalizeBootstrapConfig(stored);
    }
  } catch {
    // IPC not available (e.g. dev/test env) — fall through to default
  }
  return DEFAULT_BOOTSTRAP_CONFIG;
}

async function writeThemeToStore(id: AppTheme): Promise<void> {
  try {
    const api = window.electronAPI;
    if (api?.theme?.set) {
      await api.theme.set(id);
    }
  } catch {
    // IPC not available — ignore
  }
}

interface UseThemeReturn {
  theme: Theme;
  setTheme: (id: string) => Promise<void>;
  themes: Theme[];
  showBgGradient: boolean;
  setShowBgGradient: (value: boolean) => void;
  glassOpacity: number;
  setGlassOpacity: (value: number) => void;
}

function applyRuntimeState(nextState: ThemeRuntimeState): void {
  runtimeState = nextState;
  if (Object.keys(nextState.customThemeColors).length > 0) {
    Object.assign(customTheme.colors, nextState.customThemeColors);
  }
  const theme = getTheme(nextState.themeId);
  applyThemeToDom(theme, nextState.showBgGradient, nextState.glassOpacity);
  applyFontConfig(nextState.fontUI, nextState.fontMono, nextState.fontSizeUI);
  updateTitleBarOverlay(theme);
  emitRuntimeState();
}

function setRuntimeState(partial: Partial<ThemeRuntimeState>): void {
  applyRuntimeState({
    ...runtimeState,
    ...partial,
    customThemeColors: partial.customThemeColors ?? runtimeState.customThemeColors,
  });
}

function registerThemeChangeListener(): void {
  if (themeChangeCleanup || !window.electronAPI?.theme?.onChange) {
    return;
  }

  themeChangeCleanup = window.electronAPI.theme.onChange((newTheme) => {
    if (isValidThemeId(newTheme)) {
      setRuntimeState({ themeId: newTheme, hydrated: true });
    }
  });
}

/**
 * Fetch extension theme contributions from the main process and register
 * them into the themes registry.  Called once at startup so that a saved
 * `ext:*` activeTheme resolves before the first render.
 */
async function loadExtensionThemesIntoRegistry(): Promise<void> {
  try {
    const api = window.electronAPI?.extensionStore
    if (!api?.getThemeContributions) return

    const result = await api.getThemeContributions()
    if (!result.success || !result.themes) return

    // Clear any stale ext themes
    for (const id of Object.keys(themes)) {
      if (id.startsWith('ext:')) unregisterExtensionTheme(id)
    }

    for (const t of result.themes) {
      registerExtensionTheme({
        id: t.id,
        name: t.name,
        fontFamily: t.fontFamily,
        colors: t.colors,
      })
    }
  } catch {
    // Extension themes are optional — don't block startup
  }
}

async function hydrateThemeOnMount(config?: Partial<ThemeBootstrapConfig> | null): Promise<void> {
  // Load extension themes BEFORE resolving activeTheme so ext:* IDs are valid
  await loadExtensionThemesIntoRegistry();

  const resolved = config ? normalizeBootstrapConfig(config) : await readThemeBootstrapConfig();
  registerThemeChangeListener();
  applyRuntimeState({
    themeId: resolved.activeTheme,
    showBgGradient: resolved.showBgGradient,
    glassOpacity: resolved.glassOpacity,
    customThemeColors: resolved.customThemeColors,
    fontUI: resolved.fontUI,
    fontMono: resolved.fontMono,
    fontSizeUI: resolved.fontSizeUI,
    hydrated: true,
  });
}

function ensureThemeRuntime(): void {
  if (runtimeState.hydrated || hydrationPromise) {
    return;
  }

  hydrationPromise = hydrateThemeOnMount().finally(() => {
    hydrationPromise = null;
  });
}

function subscribeToThemeRuntime(listener: (state: ThemeRuntimeState) => void): () => void {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

export function useThemeRuntimeBootstrap(config: AppConfig | null): void {
  useLayoutEffect(() => {
    if (!config) {
      return;
    }

    hydrationPromise = hydrateThemeOnMount(config).finally(() => {
      hydrationPromise = null;
    });
  }, [config]);
}

/** Call after registering/unregistering extension themes to refresh consumers */
export function notifyExtensionThemesChanged(): void {
  emitRuntimeState();
}

function persistBgGradient(value: boolean): void {
  try {
    window.electronAPI?.config?.set('showBgGradient', value);
  } catch {
    // ignore
  }
}

export function useTheme(): UseThemeReturn {
  const [snapshot, setSnapshot] = useState<ThemeRuntimeState>(() => cloneRuntimeState());

  useEffect(() => {
    ensureThemeRuntime();
    return subscribeToThemeRuntime((nextState) => {
      setSnapshot(nextState);
    });
  }, []);

  const setTheme = useCallback(async (id: string) => {
    const resolved = (isValidThemeId(id) ? id : defaultThemeId) as AppTheme;
    setRuntimeState({ themeId: resolved, hydrated: true });
    await writeThemeToStore(resolved);
  }, []);

  const setShowBgGradient = useCallback((value: boolean) => {
    setRuntimeState({ showBgGradient: value, hydrated: true });
    persistBgGradient(value);
  }, []);

  const setGlassOpacity = useCallback((value: number) => {
    setRuntimeState({ glassOpacity: value, hydrated: true });
    try { window.electronAPI?.config?.set('glassOpacity', value); } catch { /* ignore */ }
  }, []);

  // Build live theme list: built-ins + any registered extension themes
  const allThemes = useMemo(() => {
    const extThemes = Object.values(themes).filter((t) => t.id.startsWith('ext:'));
    return [...themeList, ...extThemes];
  // Re-derive when the theme ID changes (triggers after extension install/uninstall)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.themeId, snapshot.hydrated]);

  return useMemo(() => ({
    theme: getTheme(snapshot.themeId),
    setTheme,
    themes: allThemes,
    showBgGradient: snapshot.showBgGradient,
    setShowBgGradient,
    glassOpacity: snapshot.glassOpacity,
    setGlassOpacity,
  }), [allThemes, setGlassOpacity, setShowBgGradient, setTheme, snapshot.glassOpacity, snapshot.showBgGradient, snapshot.themeId]);
}
