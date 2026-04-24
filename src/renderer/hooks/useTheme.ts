import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { customTheme, defaultThemeId, getTheme, type Theme, themeList, themes } from '../themes';
import {
  DEFAULT_MATERIAL_VARIANT,
  getMaterialVariant,
  type MaterialVariant,
} from '../themes/material';

const NONE_THEME_FONTS: Theme['fontFamily'] = {
  mono: '"Geist Mono", "JetBrains Mono", monospace',
  ui: '"Inter", system-ui, -apple-system, sans-serif',
};

function buildNoneTheme(materialVariant: MaterialVariant): Theme {
  return {
    id: 'none',
    name: 'None (Material only)',
    fontFamily: NONE_THEME_FONTS,
    colors: getMaterialVariant(materialVariant).palette,
  };
}

function resolveTheme(themeId: string, materialVariant: MaterialVariant): Theme {
  return themeId === 'none' ? buildNoneTheme(materialVariant) : getTheme(themeId);
}
import type { AppConfig, AppTheme } from '../types/electron';
import { useThemeActions } from './useTheme.actions';
import {
  applyFontConfig,
  applyThemeToDom,
  loadExtensionThemesIntoRegistry,
  updateTitleBarOverlay,
} from './useTheme.tokens';

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
  materialVariant: MaterialVariant;
  customThemeColors: Record<string, string>;
  fontUI: string;
  fontMono: string;
  fontSizeUI: number;
  hydrated: boolean;
}

type ThemeBootstrapConfig = Pick<
  AppConfig,
  | 'activeTheme'
  | 'showBgGradient'
  | 'glassOpacity'
  | 'materialVariant'
  | 'customThemeColors'
  | 'fontUI'
  | 'fontMono'
  | 'fontSizeUI'
>;

const DEFAULT_BOOTSTRAP_CONFIG: ThemeBootstrapConfig = {
  activeTheme: defaultThemeId,
  showBgGradient: true,
  glassOpacity: 0,
  materialVariant: DEFAULT_MATERIAL_VARIANT,
  customThemeColors: {},
  fontUI: '',
  fontMono: '',
  fontSizeUI: 13,
};

let runtimeState: ThemeRuntimeState = {
  themeId: defaultThemeId,
  showBgGradient: true,
  glassOpacity: 0,
  materialVariant: DEFAULT_MATERIAL_VARIANT,
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
  const s = runtimeState;
  return {
    themeId: s.themeId,
    showBgGradient: s.showBgGradient,
    glassOpacity: s.glassOpacity,
    materialVariant: s.materialVariant,
    customThemeColors: { ...s.customThemeColors },
    fontUI: s.fontUI,
    fontMono: s.fontMono,
    fontSizeUI: s.fontSizeUI,
    hydrated: s.hydrated,
  };
}

function normalizeMaterialVariant(value: unknown): MaterialVariant {
  return value === 'vapor' || value === 'prism' || value === 'warp'
    ? value
    : DEFAULT_MATERIAL_VARIANT;
}

function emitRuntimeState(): void {
  const snapshot = cloneRuntimeState();
  for (const listener of runtimeListeners) {
    listener(snapshot);
  }
}

function isValidThemeId(id: string): boolean {
  return id === 'none' || id in themes || id.startsWith('ext:');
}

function resolveActiveTheme(raw: string | undefined): string {
  return raw && isValidThemeId(raw) ? raw : DEFAULT_BOOTSTRAP_CONFIG.activeTheme;
}

function normalizeBootstrapConfig(
  config?: Partial<ThemeBootstrapConfig> | null,
): ThemeBootstrapConfig {
  const d = DEFAULT_BOOTSTRAP_CONFIG;
  const c = config ?? {};
  return {
    activeTheme: resolveActiveTheme(c.activeTheme),
    showBgGradient: c.showBgGradient ?? d.showBgGradient,
    glassOpacity: c.glassOpacity ?? d.glassOpacity,
    materialVariant: normalizeMaterialVariant(c.materialVariant ?? d.materialVariant),
    customThemeColors: c.customThemeColors ?? d.customThemeColors,
    fontUI: c.fontUI ?? d.fontUI,
    fontMono: c.fontMono ?? d.fontMono,
    fontSizeUI: c.fontSizeUI ?? d.fontSizeUI,
  };
}

function detectSystemTheme(): string {
  try {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches
    ) {
      return 'light';
    }
  } catch {
    // matchMedia not available — fall through
  }
  return defaultThemeId;
}

async function readThemeBootstrapConfig(): Promise<ThemeBootstrapConfig> {
  try {
    const api = window.electronAPI;
    if (api?.config?.getAll) {
      const stored = await api.config.getAll();
      // If no theme has been explicitly saved, default based on system preference
      if (!stored?.activeTheme) {
        return normalizeBootstrapConfig({ ...stored, activeTheme: detectSystemTheme() });
      }
      return normalizeBootstrapConfig(stored);
    }
  } catch {
    // IPC not available (e.g. dev/test env) — fall through to default
  }
  // No IPC — still respect system preference on first launch
  return { ...DEFAULT_BOOTSTRAP_CONFIG, activeTheme: detectSystemTheme() };
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
  materialVariant: MaterialVariant;
  setMaterialVariant: (value: MaterialVariant) => void;
}

function applyRuntimeState(nextState: ThemeRuntimeState): void {
  runtimeState = nextState;
  if (Object.keys(nextState.customThemeColors).length > 0)
    Object.assign(customTheme.colors, nextState.customThemeColors);
  const theme = nextState.themeId === 'none' ? null : getTheme(nextState.themeId);
  applyThemeToDom(
    theme,
    nextState.showBgGradient,
    nextState.glassOpacity,
    nextState.materialVariant,
  );
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

async function hydrateThemeOnMount(config?: Partial<ThemeBootstrapConfig> | null): Promise<void> {
  // Load extension themes BEFORE resolving activeTheme so ext:* IDs are valid
  await loadExtensionThemesIntoRegistry();

  const resolved = config ? normalizeBootstrapConfig(config) : await readThemeBootstrapConfig();
  registerThemeChangeListener();
  applyRuntimeState({
    themeId: resolved.activeTheme,
    showBgGradient: resolved.showBgGradient,
    glassOpacity: resolved.glassOpacity,
    materialVariant: resolved.materialVariant,
    customThemeColors: resolved.customThemeColors,
    fontUI: resolved.fontUI,
    fontMono: resolved.fontMono,
    fontSizeUI: resolved.fontSizeUI,
    hydrated: true,
  });
}

function ensureThemeRuntime(): void {
  if (runtimeState.hydrated || hydrationPromise) return;
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
  'use no memo';
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

function useThemeSnapshot(): ThemeRuntimeState {
  'use no memo';
  const [snapshot, setSnapshot] = useState<ThemeRuntimeState>(() => cloneRuntimeState());
  useEffect(() => {
    ensureThemeRuntime();
    return subscribeToThemeRuntime((nextState) => {
      setSnapshot(nextState);
    });
  }, []);
  return snapshot;
}

export function useTheme(): UseThemeReturn {
  'use no memo';
  const snapshot = useThemeSnapshot();
  const { setTheme, setShowBgGradient, setGlassOpacity, setMaterialVariant } = useThemeActions({
    setRuntimeState,
    writeThemeToStore,
  });

  // Build live theme list: built-ins + any registered extension themes
  const allThemes = useMemo(() => {
    const extThemes = Object.values(themes).filter((t) => t.id.startsWith('ext:'));
    return [...themeList, ...extThemes];
    // Re-derive when the theme ID changes (triggers after extension install/uninstall)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.themeId, snapshot.hydrated]);

  return useMemo(
    () => ({
      theme: resolveTheme(snapshot.themeId, snapshot.materialVariant),
      setTheme,
      themes: allThemes,
      showBgGradient: snapshot.showBgGradient,
      setShowBgGradient,
      glassOpacity: snapshot.glassOpacity,
      setGlassOpacity,
      materialVariant: snapshot.materialVariant,
      setMaterialVariant,
    }),
    [
      allThemes,
      setGlassOpacity,
      setMaterialVariant,
      setShowBgGradient,
      setTheme,
      snapshot.glassOpacity,
      snapshot.materialVariant,
      snapshot.showBgGradient,
      snapshot.themeId,
    ],
  );
}
