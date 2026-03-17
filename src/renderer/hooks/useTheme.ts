import { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { getTheme, themes, themeList, defaultThemeId, customTheme, registerExtensionTheme, unregisterExtensionTheme } from '../themes';
import type { Theme } from '../themes';
import type { AppConfig, AppTheme } from '../types/electron';

export function applyFontConfig(fontUI: string, fontMono: string, fontSizeUI: number): void {
  const root = document.documentElement;
  if (fontUI) {
    root.style.setProperty('--font-ui', `"${fontUI}", system-ui, sans-serif`);
  }
  if (fontMono) {
    root.style.setProperty('--font-mono', `"${fontMono}", monospace`);
  }
  const clampedSize = Math.max(11, Math.min(18, fontSizeUI || 13));
  root.style.setProperty('--font-size-ui', `${clampedSize}px`);
  root.style.fontSize = `${clampedSize}px`;
}

function updateTitleBarOverlay(theme: Theme): void {
  try {
    const api = window.electronAPI;
    if (api?.app?.setTitleBarOverlay) {
      api.app.setTitleBarOverlay(theme.colors.bg, theme.colors.textMuted);
    }
  } catch {
    // IPC not available — ignore
  }
}

function applyThemeToDom(theme: Theme, showBgGradient = true): void {
  const root = document.documentElement;
  const { colors, fontFamily, effects } = theme;

  // Color tokens — used as CSS vars throughout the app
  root.style.setProperty('--bg', colors.bg);
  root.style.setProperty('--bg-secondary', colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--border-muted', colors.borderMuted);
  root.style.setProperty('--text', colors.text);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-muted', colors.textMuted);
  root.style.setProperty('--text-faint', colors.textFaint);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-hover', colors.accentHover);
  root.style.setProperty('--accent-muted', colors.accentMuted);
  root.style.setProperty('--success', colors.success);
  root.style.setProperty('--warning', colors.warning);
  root.style.setProperty('--error', colors.error);
  root.style.setProperty('--purple', colors.purple);
  root.style.setProperty('--purple-muted', colors.purpleMuted);
  root.style.setProperty('--selection', colors.selection);
  root.style.setProperty('--focus-ring', colors.focusRing);

  // Terminal-specific tokens
  root.style.setProperty('--term-bg', colors.termBg);
  root.style.setProperty('--term-fg', colors.termFg);
  root.style.setProperty('--term-cursor', colors.termCursor);
  root.style.setProperty('--term-selection', colors.termSelection);

  // Git status tokens (derived from existing theme colors)
  root.style.setProperty('--git-modified', colors.warning);
  root.style.setProperty('--git-added', colors.success);
  root.style.setProperty('--git-deleted', colors.error);
  root.style.setProperty('--git-untracked', colors.textMuted);

  // Font tokens
  root.style.setProperty('--font-mono', fontFamily.mono);
  root.style.setProperty('--font-ui', fontFamily.ui);

  // Background gradient — set to 'none' when disabled or absent
  const gradient = showBgGradient && theme.backgroundGradient ? theme.backgroundGradient : 'none';
  root.style.setProperty('--bg-gradient', gradient);

  // Effect flags (data attributes for CSS targeting)
  root.dataset['themeId'] = theme.id;
  root.dataset['scanlines'] = String(effects?.scanlines ?? false);
  root.dataset['glowText'] = String(effects?.glowText ?? false);

  // Notify terminals and other consumers that CSS vars have been updated
  window.dispatchEvent(new Event('agent-ide:theme-applied'));
}

/**
 * Merge saved custom color overrides into the mutable customTheme object,
 * then re-apply CSS vars for any overridden keys.
 */
export function applyCustomThemeColors(colors: Record<string, string>): void {
  const root = document.documentElement;
  // Merge into the shared customTheme colors so getTheme('custom') stays current
  Object.assign(customTheme.colors, colors);
  for (const [cssVar, value] of Object.entries(colors)) {
    root.style.setProperty(cssVar, value);
  }
}

interface ThemeRuntimeState {
  themeId: string;
  showBgGradient: boolean;
  customThemeColors: Record<string, string>;
  fontUI: string;
  fontMono: string;
  fontSizeUI: number;
  hydrated: boolean;
}

type ThemeBootstrapConfig = Pick<
  AppConfig,
  'activeTheme' | 'showBgGradient' | 'customThemeColors' | 'fontUI' | 'fontMono' | 'fontSizeUI'
>;

const DEFAULT_BOOTSTRAP_CONFIG: ThemeBootstrapConfig = {
  activeTheme: defaultThemeId,
  showBgGradient: true,
  customThemeColors: {},
  fontUI: '',
  fontMono: '',
  fontSizeUI: 13,
};

let runtimeState: ThemeRuntimeState = {
  themeId: defaultThemeId,
  showBgGradient: true,
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

function normalizeBootstrapConfig(config?: Partial<ThemeBootstrapConfig> | null): ThemeBootstrapConfig {
  return {
    activeTheme:
      config?.activeTheme && isValidThemeId(config.activeTheme)
        ? config.activeTheme
        : DEFAULT_BOOTSTRAP_CONFIG.activeTheme,
    showBgGradient: config?.showBgGradient ?? DEFAULT_BOOTSTRAP_CONFIG.showBgGradient,
    customThemeColors: config?.customThemeColors ?? DEFAULT_BOOTSTRAP_CONFIG.customThemeColors,
    fontUI: config?.fontUI ?? DEFAULT_BOOTSTRAP_CONFIG.fontUI,
    fontMono: config?.fontMono ?? DEFAULT_BOOTSTRAP_CONFIG.fontMono,
    fontSizeUI: config?.fontSizeUI ?? DEFAULT_BOOTSTRAP_CONFIG.fontSizeUI,
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
}

function applyRuntimeState(nextState: ThemeRuntimeState): void {
  runtimeState = nextState;
  if (Object.keys(nextState.customThemeColors).length > 0) {
    Object.assign(customTheme.colors, nextState.customThemeColors);
  }
  const theme = getTheme(nextState.themeId);
  applyThemeToDom(theme, nextState.showBgGradient);
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
  }), [allThemes, setShowBgGradient, setTheme, snapshot.showBgGradient, snapshot.themeId]);
}
