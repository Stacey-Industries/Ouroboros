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
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
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
    const match = resolved.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );
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

const THEME_NAME = 'ouroboros';

/**
 * Build a Monaco IStandaloneThemeData from the current CSS custom properties.
 */
function buildThemeData(): monaco.editor.IStandaloneThemeData {
  const bg = cssVarHex('--bg', '#111113');
  const bgSecondary = cssVarHex('--bg-secondary', '#18181b');
  const text = cssVarHex('--text', '#fafafa');
  const textSecondary = cssVarHex('--text-secondary', '#a1a1aa');
  const textMuted = cssVarHex('--text-muted', '#52525b');
  const border = cssVarHex('--border', '#3f3f46');
  const accent = cssVarHex('--accent', '#818cf8');
  const accentMuted = cssVarHex('--accent-muted', '#818cf826');
  const selection = cssVarHex('--selection', '#6366f140');
  const success = cssVarHex('--success', '#34d399');
  const warning = cssVarHex('--warning', '#fbbf24');
  const error = cssVarHex('--error', '#f87171');
  const purple = cssVarHex('--purple', '#a78bfa');

  return {
    base: 'vs-dark',
    inherit: true, // inherit token rules from vs-dark for unmapped tokens
    rules: [
      // Comments
      { token: 'comment', foreground: textMuted.replace('#', ''), fontStyle: 'italic' },
      { token: 'comment.block', foreground: textMuted.replace('#', ''), fontStyle: 'italic' },
      { token: 'comment.line', foreground: textMuted.replace('#', ''), fontStyle: 'italic' },

      // Keywords
      { token: 'keyword', foreground: accent.replace('#', '') },
      { token: 'keyword.control', foreground: accent.replace('#', '') },
      { token: 'keyword.operator', foreground: textSecondary.replace('#', '') },

      // Strings
      { token: 'string', foreground: success.replace('#', '') },
      { token: 'string.escape', foreground: warning.replace('#', '') },

      // Numbers
      { token: 'number', foreground: warning.replace('#', '') },
      { token: 'number.hex', foreground: warning.replace('#', '') },

      // Types
      { token: 'type', foreground: purple.replace('#', '') },
      { token: 'type.identifier', foreground: purple.replace('#', '') },

      // Functions
      { token: 'entity.name.function', foreground: accent.replace('#', '') },
      { token: 'support.function', foreground: accent.replace('#', '') },

      // Variables
      { token: 'variable', foreground: text.replace('#', '') },
      { token: 'variable.predefined', foreground: purple.replace('#', '') },

      // Constants
      { token: 'constant', foreground: warning.replace('#', '') },

      // Tags (HTML/XML)
      { token: 'tag', foreground: error.replace('#', '') },
      { token: 'attribute.name', foreground: accent.replace('#', '') },
      { token: 'attribute.value', foreground: success.replace('#', '') },

      // Regex
      { token: 'regexp', foreground: error.replace('#', '') },

      // Operators / Delimiters
      { token: 'delimiter', foreground: textSecondary.replace('#', '') },
      { token: 'operator', foreground: textSecondary.replace('#', '') },

      // Markdown
      { token: 'markup.heading', foreground: accent.replace('#', ''), fontStyle: 'bold' },
      { token: 'markup.bold', fontStyle: 'bold' },
      { token: 'markup.italic', fontStyle: 'italic' },
      { token: 'markup.inline', foreground: success.replace('#', '') },
    ],
    colors: {
      // Editor core
      'editor.background': bg,
      'editor.foreground': text,
      'editor.lineHighlightBackground': bgSecondary,
      'editor.lineHighlightBorder': '#00000000', // transparent

      // Selection
      'editor.selectionBackground': selection,
      'editor.inactiveSelectionBackground': accentMuted,
      'editor.selectionHighlightBackground': accentMuted,
      'editor.wordHighlightBackground': accentMuted,
      'editor.wordHighlightStrongBackground': accentMuted,
      'editor.findMatchBackground': '#fbbf2440',
      'editor.findMatchHighlightBackground': '#fbbf2420',

      // Cursor
      'editorCursor.foreground': accent,

      // Whitespace
      'editorWhitespace.foreground': textMuted,

      // Indentation guides
      'editorIndentGuide.background': border,
      'editorIndentGuide.activeBackground': textMuted,

      // Line numbers
      'editorLineNumber.foreground': textMuted,
      'editorLineNumber.activeForeground': textSecondary,

      // Gutter
      'editorGutter.background': bg,
      'editorGutter.modifiedBackground': warning,
      'editorGutter.addedBackground': success,
      'editorGutter.deletedBackground': error,

      // Brackets
      'editorBracketMatch.border': accent,
      'editorBracketMatch.background': accentMuted,

      // Overview ruler (minimap scrollbar)
      'editorOverviewRuler.border': border,
      'editorOverviewRuler.findMatchForeground': warning,
      'editorOverviewRuler.errorForeground': error,
      'editorOverviewRuler.warningForeground': warning,
      'editorOverviewRuler.infoForeground': accent,

      // Minimap
      'minimap.background': bg,
      'minimapSlider.background': accentMuted,
      'minimapSlider.hoverBackground': selection,
      'minimapSlider.activeBackground': selection,

      // Scrollbar
      'scrollbar.shadow': '#00000033',
      'scrollbarSlider.background': accentMuted,
      'scrollbarSlider.hoverBackground': selection,
      'scrollbarSlider.activeBackground': selection,

      // Widget (find/replace, command palette, etc.)
      'editorWidget.background': bgSecondary,
      'editorWidget.foreground': text,
      'editorWidget.border': border,
      'editorWidget.resizeBorder': accent,

      // Find widget input
      'inputOption.activeBorder': accent,
      'inputOption.activeBackground': accentMuted,
      'inputOption.activeForeground': text,
      'inputOption.hoverBackground': accentMuted,
      'input.background': bg,
      'input.foreground': text,
      'input.border': border,
      'input.placeholderForeground': textMuted,

      // Find match highlight (current match stronger)
      'editor.findMatchBorder': warning,
      'editor.findMatchHighlightBorder': '#00000000',

      // Suggest / autocomplete
      'editorSuggestWidget.background': bgSecondary,
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.foreground': text,
      'editorSuggestWidget.selectedBackground': accentMuted,
      'editorSuggestWidget.highlightForeground': accent,

      // Peek view
      'peekView.border': accent,
      'peekViewEditor.background': bg,
      'peekViewResult.background': bgSecondary,
      'peekViewTitle.background': bgSecondary,

      // Sticky scroll
      'editorStickyScroll.background': bg,
      'editorStickyScrollHover.background': bgSecondary,

      // Diff editor
      'diffEditor.insertedTextBackground': '#34d39920',
      'diffEditor.removedTextBackground': '#f8717120',
      'diffEditor.insertedLineBackground': '#34d39910',
      'diffEditor.removedLineBackground': '#f8717110',
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a Monaco theme from the current CSS variables and register it.
 * Call this after the theme CSS variables are applied to the DOM.
 */
export function createOuroborosTheme(): void {
  const themeData = buildThemeData();
  monaco.editor.defineTheme(THEME_NAME, themeData);
  monaco.editor.setTheme(THEME_NAME);
}

/**
 * Re-read CSS variables, rebuild the theme, and apply it.
 * Call this whenever the Ouroboros theme changes.
 */
export function syncMonacoTheme(): void {
  createOuroborosTheme();
}

/**
 * React hook that initializes the Monaco theme on mount and keeps it in sync
 * with the Ouroboros theme system.
 *
 * Listens for the 'agent-ide:theme-applied' DOM event that `applyThemeToDom()`
 * dispatches whenever CSS variables are updated.
 */
export function useMonacoTheme(): void {
  useEffect(() => {
    // Initial theme setup — defer slightly so CSS vars are computed
    const frame = requestAnimationFrame(() => {
      createOuroborosTheme();
    });

    // Re-sync whenever the IDE theme changes
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
