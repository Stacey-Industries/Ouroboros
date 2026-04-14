/**
 * useTheme.tokens.ts — CSS custom property application, font config, and theme DOM helpers.
 * Split from useTheme.ts to stay under the max-lines limit.
 */

import type { Theme } from '../themes';
import { registerExtensionTheme, themes, unregisterExtensionTheme } from '../themes';

export function applyFontConfig(fontUI: string, fontMono: string, fontSizeUI: number): void {
  const root = document.documentElement;
  if (fontUI) root.style.setProperty('--font-ui', `"${fontUI}", system-ui, sans-serif`);
  if (fontMono) root.style.setProperty('--font-mono', `"${fontMono}", monospace`);
  const clampedSize = Math.max(11, Math.min(18, fontSizeUI || 13));
  root.style.setProperty('--font-size-ui', `${clampedSize}px`);
  root.style.fontSize = `${clampedSize}px`;
}

/** Ensure a hex color's brightness is at least `min` (0-255). Returns original if bright enough. */
export function brightenIfDark(color: string, min: number): string {
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

export function applyPaletteTokens(root: HTMLElement, colors: Theme['colors']): void {
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

export function applySemanticTokens(root: HTMLElement, colors: Theme['colors']): void {
  root.style.setProperty('--surface-base', 'transparent');
  root.style.setProperty('--surface-panel', 'transparent');
  root.style.setProperty('--surface-raised', 'rgba(255, 255, 255, 0.05)');
  root.style.setProperty('--surface-overlay', 'rgba(10, 10, 14, 0.92)');
  root.style.setProperty('--surface-inset', 'rgba(0, 0, 0, 0.15)');
  root.style.setProperty('--text-primary', colors.text);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-muted', '#c0c0d4');
  root.style.setProperty('--text-faint', '#a0a0b8');
  root.style.setProperty('--text-on-accent', colors.bg);
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

export function applyComponentTokens(root: HTMLElement, colors: Theme['colors']): void {
  root.style.setProperty('--tab-active-bg', 'transparent');
  root.style.setProperty('--tab-inactive-bg', 'transparent');
  root.style.setProperty('--tab-hover-bg', 'rgba(255, 255, 255, 0.05)');
  root.style.setProperty('--tab-active-border', colors.accent);
  root.style.setProperty('--composer-bg', 'transparent');
  root.style.setProperty('--composer-border', 'rgba(255, 255, 255, 0.08)');
  root.style.setProperty('--term-bg', 'rgba(0,0,0,0)');
  root.style.setProperty('--term-fg', colors.termFg);
  root.style.setProperty('--term-cursor', colors.termCursor);
  root.style.setProperty('--term-selection', colors.termSelection);
  root.style.setProperty('--monaco-bg', colors.bg === 'transparent' ? '#00000001' : colors.bg);
  root.style.setProperty('--chat-user-bg', colors.accent);
  root.style.setProperty('--chat-user-text', colors.bg);
}

export function applyDerivedTokens(root: HTMLElement, colors: Theme['colors']): void {
  root.style.setProperty('--git-modified', colors.warning);
  root.style.setProperty('--git-added', colors.success);
  root.style.setProperty('--git-deleted', colors.error);
  root.style.setProperty('--git-untracked', colors.textMuted);
}

export function updateTitleBarOverlay(theme: Theme): void {
  try {
    const api = window.electronAPI;
    if (api?.app?.setTitleBarOverlay) {
      api.app.setTitleBarOverlay(theme.colors.bg, theme.colors.textMuted);
    }
  } catch { /* IPC not available */ }
}

function buildBgGradient(theme: Theme, showBgGradient: boolean, glassOpacity: number): string {
  const opacity = Math.max(0, Math.min(100, glassOpacity)) / 100;
  const layers: string[] = [];
  if (opacity > 0) layers.push(`linear-gradient(rgba(0, 0, 0, ${opacity}), rgba(0, 0, 0, ${opacity}))`);
  if (showBgGradient && theme.backgroundGradient) layers.push(theme.backgroundGradient);
  return layers.length > 0 ? layers.join(', ') : 'none';
}

export function applyThemeToDom(theme: Theme, showBgGradient = true, glassOpacity = 0): void {
  const root = document.documentElement;
  const { colors, fontFamily, effects } = theme;
  applyPaletteTokens(root, colors);
  applySemanticTokens(root, colors);
  applyComponentTokens(root, colors);
  applyDerivedTokens(root, colors);
  root.style.setProperty('--bg-gradient', buildBgGradient(theme, showBgGradient, glassOpacity));
  root.style.setProperty('--font-mono', fontFamily.mono);
  root.style.setProperty('--font-ui', fontFamily.ui);
  root.dataset['themeId'] = theme.id;
  root.dataset['scanlines'] = String(effects?.scanlines ?? false);
  root.dataset['glowText'] = String(effects?.glowText ?? false);
  window.dispatchEvent(new Event('agent-ide:theme-applied'));
}

/** Fetch extension theme contributions and register them into the themes registry. */
export async function loadExtensionThemesIntoRegistry(): Promise<void> {
  try {
    const api = window.electronAPI?.extensionStore;
    if (!api?.getThemeContributions) return;
    const result = await api.getThemeContributions();
    if (!result.success || !result.themes) return;
    for (const id of Object.keys(themes)) {
      if (id.startsWith('ext:')) unregisterExtensionTheme(id);
    }
    for (const t of result.themes) {
      registerExtensionTheme({ id: t.id, name: t.name, fontFamily: t.fontFamily, colors: t.colors });
    }
  } catch {
    // Extension themes are optional — don't block startup
  }
}
