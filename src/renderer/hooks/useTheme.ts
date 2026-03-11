import { useState, useEffect, useCallback } from 'react';
import { getTheme, themes, themeList, defaultThemeId, customTheme } from '../themes';
import type { Theme } from '../themes';
import type { AppTheme } from '../types/electron';

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

async function readThemeFromStore(): Promise<string> {
  try {
    const api = window.electronAPI;
    if (api?.theme?.get) {
      const stored = await api.theme.get();
      if (stored && stored in themes) {
        return stored;
      }
    }
  } catch {
    // IPC not available (e.g. dev/test env) — fall through to default
  }
  return defaultThemeId;
}

async function readShowBgGradient(): Promise<boolean> {
  try {
    const api = window.electronAPI;
    if (api?.config?.get) {
      return (await api.config.get('showBgGradient')) as boolean ?? true;
    }
  } catch {
    // ignore
  }
  return true;
}

async function readCustomThemeColors(): Promise<Record<string, string>> {
  try {
    const api = window.electronAPI;
    if (api?.config?.get) {
      return (await api.config.get('customThemeColors') as Record<string, string>) ?? {};
    }
  } catch {
    // ignore
  }
  return {};
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

export function useTheme(): UseThemeReturn {
  const [themeId, setThemeId] = useState<string>(defaultThemeId);
  const [showBgGradient, setShowBgGradientState] = useState<boolean>(true);

  // On mount, load persisted theme, gradient setting, custom colors, and font config
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      readThemeFromStore(),
      readShowBgGradient(),
      readCustomThemeColors(),
    ]).then(([id, gradient, customColors]) => {
      if (cancelled) return;
      setThemeId(id);
      setShowBgGradientState(gradient);
      // Hydrate custom theme colors into the mutable object before applying
      if (Object.keys(customColors).length > 0) {
        Object.assign(customTheme.colors, customColors);
      }
      applyThemeToDom(getTheme(id), gradient);
    });

    // Apply persisted font config
    try {
      const api = window.electronAPI;
      if (api?.config?.getAll) {
        api.config.getAll().then((cfg) => {
          if (!cancelled && cfg) {
            applyFontConfig(cfg.fontUI ?? '', cfg.fontMono ?? '', cfg.fontSizeUI ?? 13);
          }
        }).catch(() => {/* ignore */});
      }
    } catch {
      // IPC not available — ignore
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // Re-apply whenever themeId or gradient toggle changes
  useEffect(() => {
    const theme = getTheme(themeId);
    applyThemeToDom(theme, showBgGradient);
    updateTitleBarOverlay(theme);
  }, [themeId, showBgGradient]);

  // Listen for theme changes from other parts of the app (settings modal, etc.)
  useEffect(() => {
    if (!window.electronAPI?.theme?.onChange) return;
    const cleanup = window.electronAPI.theme.onChange((newTheme) => {
      if (newTheme in themes) {
        setThemeId(newTheme);
        applyThemeToDom(getTheme(newTheme), showBgGradient);
      }
    });
    return cleanup;
  // showBgGradient is intentionally excluded — changes handled by the themeId/showBgGradient effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback(async (id: string) => {
    const resolved = (id in themes ? id : defaultThemeId) as AppTheme;
    setThemeId(resolved);
    applyThemeToDom(getTheme(resolved), showBgGradient);
    await writeThemeToStore(resolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBgGradient]);

  const setShowBgGradient = useCallback((value: boolean) => {
    setShowBgGradientState(value);
    // Persist via config IPC
    try {
      window.electronAPI?.config?.set('showBgGradient', value);
    } catch {
      // ignore
    }
  }, []);

  return {
    theme: getTheme(themeId),
    setTheme,
    themes: themeList,
    showBgGradient,
    setShowBgGradient,
  };
}
