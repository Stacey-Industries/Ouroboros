/**
 * Monaco Theme Bridge — syncs CSS custom properties from the Ouroboros theme
 * system into a Monaco IStandaloneThemeData definition.
 *
 * Monaco requires hex/rgb color values (not CSS variable references), so we
 * read the computed values from the DOM and build the theme object at runtime.
 */
import * as monaco from 'monaco-editor';
import { useEffect } from 'react';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read a CSS custom property from the document root, returning a trimmed string.
 * Returns the fallback if the variable is not set or empty.
 */
function getCssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Convert a CSS color value (hex, rgb, rgba, hsl, etc.) to a hex string
 * that Monaco can consume. Monaco accepts #RRGGBB or #RRGGBBAA formats.
 */
function toHex(cssColor: string): string {
  if (!cssColor) return '';

  // Already hex
  if (cssColor.startsWith('#')) {
    return cssColor;
  }

  // Use a temporary canvas to resolve any CSS color to RGBA
  if (typeof document === 'undefined') return cssColor;

  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return cssColor;
    ctx.fillStyle = cssColor;
    // ctx.fillStyle is now normalized to #rrggbb or rgba(...)
    const resolved = ctx.fillStyle;
    if (resolved.startsWith('#')) return resolved;

    // Parse rgba(r, g, b, a) format
    const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
      const hex = `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
      if (a < 1) {
        return hex + componentToHex(Math.round(a * 255));
      }
      return hex;
    }
  } catch {
    // fallback — return as-is
  }
  return cssColor;
}

function componentToHex(c: number): string {
  const hex = c.toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

/**
 * Read a CSS var and convert to hex for Monaco.
 */
function cssVarHex(name: string, fallback = '#000000'): string {
  return toHex(getCssVar(name, fallback));
}

// ────────────────────────────────────────────────────────────────────────────
// Theme generation
// ────────────────────────────────────────────────────────────────────────────

interface ThemePalette {
  bg: string;
  bgSecondary: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accent: string;
  accentMuted: string;
  selection: string;
  success: string;
  warning: string;
  error: string;
  purple: string;
}

function getThemePalette(): ThemePalette {
  return {
    bg: cssVarHex('--monaco-bg', '#111113'),
    bgSecondary: cssVarHex('--palette-bg-secondary', '#18181b'),
    text: cssVarHex('--text-primary', '#fafafa'),
    textSecondary: cssVarHex('--text-secondary', '#a1a1aa'),
    textMuted: cssVarHex('--text-muted', '#c0c0d4'),
    border: cssVarHex('--border-default', '#3f3f46'),
    accent: cssVarHex('--interactive-accent', '#818cf8'),
    accentMuted: cssVarHex('--interactive-muted', '#818cf826'),
    selection: cssVarHex('--interactive-selection', '#6366f140'),
    success: cssVarHex('--status-success', '#34d399'),
    warning: cssVarHex('--status-warning', '#fbbf24'),
    error: cssVarHex('--status-error', '#f87171'),
    purple: cssVarHex('--palette-purple', '#a78bfa'),
  };
}

function buildThemeRules(palette: ThemePalette): monaco.editor.ITokenThemeRule[] {
  return [
    { token: 'comment', foreground: palette.textMuted.replace('#', ''), fontStyle: 'italic' },
    { token: 'comment.block', foreground: palette.textMuted.replace('#', ''), fontStyle: 'italic' },
    { token: 'comment.line', foreground: palette.textMuted.replace('#', ''), fontStyle: 'italic' },
    { token: 'keyword', foreground: palette.accent.replace('#', '') },
    { token: 'keyword.control', foreground: palette.accent.replace('#', '') },
    { token: 'keyword.operator', foreground: palette.textSecondary.replace('#', '') },
    { token: 'string', foreground: palette.success.replace('#', '') },
    { token: 'string.escape', foreground: palette.warning.replace('#', '') },
    { token: 'number', foreground: palette.warning.replace('#', '') },
    { token: 'number.hex', foreground: palette.warning.replace('#', '') },
    { token: 'type', foreground: palette.purple.replace('#', '') },
    { token: 'type.identifier', foreground: palette.purple.replace('#', '') },
    { token: 'entity.name.function', foreground: palette.accent.replace('#', '') },
    { token: 'support.function', foreground: palette.accent.replace('#', '') },
    { token: 'variable', foreground: palette.text.replace('#', '') },
    { token: 'variable.predefined', foreground: palette.purple.replace('#', '') },
    { token: 'constant', foreground: palette.warning.replace('#', '') },
    { token: 'tag', foreground: palette.error.replace('#', '') },
    { token: 'attribute.name', foreground: palette.accent.replace('#', '') },
    { token: 'attribute.value', foreground: palette.success.replace('#', '') },
    { token: 'regexp', foreground: palette.error.replace('#', '') },
    { token: 'delimiter', foreground: palette.textSecondary.replace('#', '') },
    { token: 'operator', foreground: palette.textSecondary.replace('#', '') },
    { token: 'markup.heading', foreground: palette.accent.replace('#', ''), fontStyle: 'bold' },
    { token: 'markup.bold', fontStyle: 'bold' },
    { token: 'markup.italic', fontStyle: 'italic' },
    { token: 'markup.inline', foreground: palette.success.replace('#', '') },
  ];
}

function buildThemeColors(palette: ThemePalette): monaco.editor.IColors {
  return {
    'editor.background': palette.bg,
    'editor.foreground': palette.text,
    'editor.lineHighlightBackground': palette.bgSecondary,
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': palette.selection,
    'editor.inactiveSelectionBackground': palette.accentMuted,
    'editor.selectionHighlightBackground': palette.accentMuted,
    'editor.wordHighlightBackground': palette.accentMuted,
    'editor.wordHighlightStrongBackground': palette.accentMuted,
    'editor.findMatchBackground': '#fbbf2440',
    'editor.findMatchHighlightBackground': '#fbbf2420',
    'editorCursor.foreground': palette.accent,
    'editorBracketMatch.background': palette.accentMuted,
    'editorBracketMatch.border': palette.accent,
    'editorIndentGuide.background1': palette.border,
    'editorIndentGuide.activeBackground1': palette.accentMuted,
    'editorGutter.background': palette.bg,
    'editorGutter.modifiedBackground': palette.warning,
    'editorGutter.addedBackground': palette.success,
    'editorGutter.deletedBackground': palette.error,
    'editorError.foreground': palette.error,
    'editorWarning.foreground': palette.warning,
    'editorInfo.foreground': palette.accent,
  };
}

const THEME_NAME = 'ouroboros';

function buildThemeData(): monaco.editor.IStandaloneThemeData {
  const palette = getThemePalette();
  return {
    base: 'vs-dark',
    inherit: true,
    rules: buildThemeRules(palette),
    colors: buildThemeColors(palette),
  };
}

export function createOuroborosTheme(): void {
  const themeData = buildThemeData();
  monaco.editor.defineTheme(THEME_NAME, themeData);
  monaco.editor.setTheme(THEME_NAME);
}

export function syncMonacoTheme(): void {
  createOuroborosTheme();
}

export function useMonacoTheme(): void {
  useEffect(() => {
    const frame = requestAnimationFrame(createOuroborosTheme);
    const handleThemeChange = (): void => {
      syncMonacoTheme();
    };
    window.addEventListener('agent-ide:theme-applied', handleThemeChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('agent-ide:theme-applied', handleThemeChange);
    };
  }, []);
}
