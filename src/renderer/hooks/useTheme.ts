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

/** Ensure a hex color's brightness is at least `min` (0-255). Returns original if bright enough. */
function brightenIfDark(color: string, min: number): string {
  const hex = color.replace('#', '');
  if (hex.length < 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const brightness = Math.max(r, g, b);
  if (brightness >= min) return color;
  const scale = min / Math.max(brightness, 1);
  const clamp = (v: number): number => Math.min(255, Math.round(v * scale));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
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

function applyPaletteTokens(root: HTMLElement, colors: Theme['colors']): void {
  root.style.setProperty('--palette-bg', colors.bg);
  root.style.setProperty('--palette-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--palette-bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--palette-text', colors.text);
  root.style.setProperty('--palette-text-secondary', colors.textSecondary);
  root.style.setProperty('--palette-text-muted', colors.textMuted);
  root.style.setProperty('--palette-text-faint', colors.textFaint);
  root.style.setProperty('--palette-border', colors.border);
  root.style.setProperty('--palette-border-muted', colors.borderMuted);
  root.style.setProperty('--palette-accent', colors.accent);
  root.style.setProperty('--palette-accent-hover', colors.accentHover);
  root.style.setProperty('--palette-accent-muted', colors.accentMuted);
  root.style.setProperty('--palette-success', colors.success);
  root.style.setProperty('--palette-warning', colors.warning);
  root.style.setProperty('--palette-error', colors.error);
  root.style.setProperty('--palette-purple', colors.purple);
  root.style.setProperty('--palette-purple-muted', colors.purpleMuted);
  root.style.setProperty('--palette-selection', colors.selection);
  root.style.setProperty('--palette-focus-ring', colors.focusRing);
  root.style.setProperty('--palette-term-fg', colors.termFg);
  root.style.setProperty('--palette-term-cursor', colors.termCursor);
  root.style.setProperty('--palette-term-selection', colors.termSelection);
}

function applySemanticTokens(root: HTMLElement, colors: Theme['colors']): void {
  // Glass: surface tokens are forced transparent so OS acrylic shows through
  root.style.setProperty('--surface-base', 'transparent');
  root.style.setProperty('--surface-panel', 'transparent');
  root.style.setProperty('--surface-raised', 'rgba(255, 255, 255, 0.05)');
  root.style.setProperty('--surface-overlay', 'rgba(10, 10, 14, 0.92)');
  root.style.setProperty('--surface-inset', 'rgba(0, 0, 0, 0.15)');
  root.style.setProperty('--text-primary', colors.text);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  // Glass: force muted/faint bright enough for transparent surfaces
  root.style.setProperty('--text-muted', '#c0c0d4');
  root.style.setProperty('--text-faint', '#a0a0b8');
  root.style.setProperty('--text-on-accent', colors.bg);
  // Glass: semi-transparent white borders regardless of theme
  root.style.setProperty('--border-default', 'rgba(255, 255, 255, 0.08)');
  root.style.setProperty('--border-subtle', 'rgba(255, 255, 255, 0.05)');
  root.style.setProperty('--border-accent', colors.accent);
  root.style.setProperty('--interactive-accent', colors.accent);
  root.style.setProperty('--interactive-hover', colors.accentHover);
  root.style.setProperty('--interactive-muted', colors.accentMuted);
  root.style.setProperty('--interactive-selection', colors.selection);
  root.style.setProperty('--interactive-focus', colors.focusRing);
  root.style.setProperty('--status-success', colors.success);
  root.style.setProperty('--status-warning', colors.warning);
  root.style.setProperty('--status-error', colors.error);
  root.style.setProperty('--status-info', colors.accent);
}

function applyComponentTokens(root: HTMLElement, colors: Theme['colors']): void {
  root.style.setProperty('--tab-active-bg', 'transparent');
  root.style.setProperty('--tab-inactive-bg', 'transparent');
  root.style.setProperty('--tab-hover-bg', 'rgba(255, 255, 255, 0.05)');
  root.style.setProperty('--tab-active-border', colors.accent);
  root.style.setProperty('--composer-bg', 'transparent');
  root.style.setProperty('--composer-border', 'rgba(255, 255, 255, 0.08)');
  // Terminal: rgba(0,0,0,0) for xterm canvas compatibility
  root.style.setProperty('--term-bg', 'rgba(0,0,0,0)');
  root.style.setProperty('--term-fg', colors.termFg);
  root.style.setProperty('--term-cursor', colors.termCursor);
  root.style.setProperty('--term-selection', colors.termSelection);
  root.style.setProperty('--monaco-bg', colors.bg === 'transparent' ? '#00000001' : colors.bg);
  root.style.setProperty('--chat-user-bg', colors.accent);
  root.style.setProperty('--chat-user-text', colors.bg);
}

function applyDerivedTokens(root: HTMLElement, colors: Theme['colors']): void {
  // Git status tokens (derived from theme colors, consumed by file tree)
  root.style.setProperty('--git-modified', colors.warning);
  root.style.setProperty('--git-added', colors.success);
  root.style.setProperty('--git-deleted', colors.error);
  root.style.setProperty('--git-untracked', colors.textMuted);
}

function applyThemeToDom(theme: Theme, showBgGradient = true, glassOpacity = 0): void {
  const root = document.documentElement;
  const { colors, fontFamily, effects } = theme;
  applyPaletteTokens(root, colors);
  applySemanticTokens(root, colors);
  applyComponentTokens(root, colors);
  applyDerivedTokens(root, colors);
  // Glass opacity overlay + background gradient
  const opacity = Math.max(0, Math.min(100, glassOpacity)) / 100;
  const layers: string[] = [];
  if (opacity > 0) {
    layers.push(`linear-gradient(rgba(0, 0, 0, ${opacity}), rgba(0, 0, 0, ${opacity}))`);
  }
  if (showBgGradient && theme.backgroundGradient) {
    layers.push(theme.backgroundGradient);
  }
  root.style.setProperty('--bg-gradient', layers.length > 0 ? layers.join(', ') : 'none');
  root.style.setProperty('--font-mono', fontFamily.mono);
  root.style.setProperty('--font-ui', fontFamily.ui);
  root.dataset['themeId'] = theme.id;
  root.dataset['scanlines'] = String(effects?.scanlines ?? false);
  root.dataset['glowText'] = String(effects?.glowText ?? false);
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

function normalizeBootstrapConfig(config?: Partial<ThemeBootstrapConfig> | null): ThemeBootstrapConfig {
  return {
    activeTheme:
      config?.activeTheme && isValidThemeId(config.activeTheme)
        ? config.activeTheme
        : DEFAULT_BOOTSTRAP_CONFIG.activeTheme,
    showBgGradient: config?.showBgGradient ?? DEFAULT_BOOTSTRAP_CONFIG.showBgGradient,
    glassOpacity: config?.glassOpacity ?? DEFAULT_BOOTSTRAP_CONFIG.glassOpacity,
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
