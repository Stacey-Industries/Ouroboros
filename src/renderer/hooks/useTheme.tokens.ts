/**
 * useTheme.tokens.ts — CSS custom property application, font config, and theme DOM helpers.
 * Split from useTheme.ts to stay under the max-lines limit.
 */

import type { Theme } from '../themes';
import { registerExtensionTheme, themes, unregisterExtensionTheme } from '../themes';
import {
  DEFAULT_MATERIAL_VARIANT,
  getMaterialVariant,
  type MaterialVariant,
} from '../themes/material';

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
  // Wave 45 — semantic surfaces stay transparent so Windows Mica bleeds
  // through. Components that want an opaque/translucent panel read the
  // material token directly (var(--material-panel) / --titlebar-bg / etc.).
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
  // Wave 45 Phase C — --surface-chat now follows the material variant's
  // panel token, not the (often transparent) theme bg. This fixes the
  // Wave 44 "bleed" bug where glass themes left the chat surface showing
  // through to the window chrome. Material is the baseline for chat mode.
  root.style.setProperty('--surface-chat', 'var(--material-panel)');
}

export function applyComponentTokens(root: HTMLElement, colors: Theme['colors']): void {
  // Wave 45 Phase C — active tab inherits the material variant's editor-bg so
  // the tab visually "merges" with the editor body. Inactive tabs stay
  // transparent (showing the title-bar / panel behind).
  root.style.setProperty('--tab-active-bg', 'var(--editor-bg)');
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

export function updateTitleBarOverlay(theme: Theme | null): void {
  try {
    const api = window.electronAPI;
    if (!api?.app?.setTitleBarOverlay) return;
    const bg = theme?.colors.bg ?? 'transparent';
    const symbol = theme?.colors.textMuted ?? '#9090a4'; // hardcoded: title-bar overlay fallback; matches SHARED_NEUTRAL_DARK.textMuted for the no-theme case.
    api.app.setTitleBarOverlay(bg, symbol);
  } catch { /* IPC not available */ }
}

const FALLBACK_FONTS: Theme['fontFamily'] = {
  mono: '"Geist Mono", "JetBrains Mono", monospace',
  ui: '"Inter", system-ui, -apple-system, sans-serif',
};

function applyMaterialTokens(
  root: HTMLElement,
  variantId: MaterialVariant | string | undefined,
): void {
  const m = getMaterialVariant(variantId);
  root.style.setProperty('--material-blur', m.blur);
  root.style.setProperty('--material-panel', m.panel);
  root.style.setProperty('--material-panel-raised', m.panelRaised);
  root.style.setProperty('--stroke-inner', m.strokeInner);
  root.style.setProperty('--stroke-faint', m.strokeFaint);
  root.style.setProperty('--radius-sm', m.radiusSm);
  root.style.setProperty('--radius-md', m.radiusMd);
  root.style.setProperty('--radius-chip', m.radiusChip);
  root.style.setProperty('--shadow-panel', m.shadowPanel);
  root.style.setProperty('--shadow-panel-sm', m.shadowPanelSm);
  root.style.setProperty('--shadow-bubble', m.shadowBubble);
  root.style.setProperty('--shadow-inset', m.shadowInset);
  root.style.setProperty('--shadow-accent', m.shadowAccent);
  root.style.setProperty('--row-active', m.rowActive);
  root.style.setProperty('--tint-accent', m.rowActive);
  root.style.setProperty('--editor-bg', m.editorBg);
  root.style.setProperty('--titlebar-bg', m.titlebarBg);
  root.style.setProperty('--composer-wash', m.composerWash);
  root.style.setProperty('--bubble-user', m.userBubble);
  root.style.setProperty('--bg-wash', m.bgWash);
  root.style.setProperty('--bg-glows', m.bgGlows);
  root.dataset['material'] = (variantId as string) ?? DEFAULT_MATERIAL_VARIANT;
}

/**
 * Write the material variant's baseline palette into `--palette-*`. This is
 * the "no theme" fallback — each variant carries its own accent/neutral
 * channel. Themes overlay on top via applyPaletteTokens().
 */
function applyMaterialPaletteTokens(
  root: HTMLElement,
  variantId: MaterialVariant | string | undefined,
): void {
  const p = getMaterialVariant(variantId).palette;
  root.style.setProperty('--palette-bg', p.bg);
  root.style.setProperty('--palette-bg-secondary', p.bgSecondary);
  root.style.setProperty('--palette-bg-tertiary', p.bgTertiary);
  root.style.setProperty('--palette-text', p.text);
  root.style.setProperty('--palette-text-secondary', p.textSecondary);
  root.style.setProperty('--palette-text-muted', p.textMuted);
  root.style.setProperty('--palette-text-faint', p.textFaint);
  root.style.setProperty('--palette-border', p.border);
  root.style.setProperty('--palette-border-muted', p.borderMuted);
  root.style.setProperty('--palette-accent', p.accent);
  root.style.setProperty('--palette-accent-hover', p.accentHover);
  root.style.setProperty('--palette-accent-muted', p.accentMuted);
  root.style.setProperty('--palette-success', p.success);
  root.style.setProperty('--palette-warning', p.warning);
  root.style.setProperty('--palette-error', p.error);
  root.style.setProperty('--palette-purple', p.purple);
  root.style.setProperty('--palette-purple-muted', p.purpleMuted);
  root.style.setProperty('--palette-selection', p.selection);
  root.style.setProperty('--palette-focus-ring', p.focusRing);
  root.style.setProperty('--palette-term-fg', p.termFg);
  root.style.setProperty('--palette-term-cursor', p.termCursor);
  root.style.setProperty('--palette-term-selection', p.termSelection);
}

/**
 * Emits the `linear-gradient` carrying the user's glassOpacity dim. The
 * material wash and glows are stacked separately by shell roots; this layer
 * only controls how much the user wants to darken the translucent surfaces.
 */
function buildGlassDim(showBgGradient: boolean, glassOpacity: number): string {
  if (!showBgGradient) return 'none';
  const opacity = Math.max(0, Math.min(100, glassOpacity)) / 100;
  if (opacity <= 0) return 'none';
  return `linear-gradient(rgba(0, 0, 0, ${opacity}), rgba(0, 0, 0, ${opacity}))`; // hardcoded: opacity-only black scrim (allowed per .claude/rules/renderer.md).
}

interface EffectiveTheme {
  colors: Theme['colors'];
  fontFamily: Theme['fontFamily'];
  effects: Theme['effects'] | undefined;
  id: string;
}

function resolveEffectiveTheme(
  theme: Theme | null,
  materialVariant: MaterialVariant | string,
): EffectiveTheme {
  return {
    colors: theme?.colors ?? getMaterialVariant(materialVariant).palette,
    fontFamily: theme?.fontFamily ?? FALLBACK_FONTS,
    effects: theme?.effects,
    id: theme?.id ?? 'none',
  };
}

function writeThemeDataAttrs(root: HTMLElement, eff: EffectiveTheme): void {
  root.dataset['themeId'] = eff.id;
  root.dataset['scanlines'] = String(eff.effects?.scanlines ?? false);
  root.dataset['glowText'] = String(eff.effects?.glowText ?? false);
}

export function applyThemeToDom(
  theme: Theme | null,
  showBgGradient = true,
  glassOpacity = 0,
  materialVariant: MaterialVariant | string = DEFAULT_MATERIAL_VARIANT,
): void {
  const root = document.documentElement;
  const eff = resolveEffectiveTheme(theme, materialVariant);
  applyMaterialPaletteTokens(root, materialVariant);
  if (theme) applyPaletteTokens(root, theme.colors);
  applyMaterialTokens(root, materialVariant);
  applySemanticTokens(root, eff.colors);
  applyComponentTokens(root, eff.colors);
  applyDerivedTokens(root, eff.colors);
  root.style.setProperty('--glass-dim', buildGlassDim(showBgGradient, glassOpacity));
  root.style.setProperty('--font-mono', eff.fontFamily.mono);
  root.style.setProperty('--font-ui', eff.fontFamily.ui);
  writeThemeDataAttrs(root, eff);
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
