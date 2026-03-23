import { customTheme,getTheme } from '../../themes';
import type { AppConfig } from '../../types/electron';

export interface ColorToken {
  cssVar: string;
  label: string;
  colorKey: keyof typeof customTheme.colors;
}

export const COLOR_TOKENS: ColorToken[] = [
  { cssVar: '--bg', label: 'Background', colorKey: 'bg' },
  { cssVar: '--bg-secondary', label: 'Background Secondary', colorKey: 'bgSecondary' },
  { cssVar: '--bg-tertiary', label: 'Background Tertiary', colorKey: 'bgTertiary' },
  { cssVar: '--border', label: 'Border', colorKey: 'border' },
  { cssVar: '--border-muted', label: 'Border Muted', colorKey: 'borderMuted' },
  { cssVar: '--text', label: 'Text', colorKey: 'text' },
  { cssVar: '--text-secondary', label: 'Text Secondary', colorKey: 'textSecondary' },
  { cssVar: '--text-muted', label: 'Text Muted', colorKey: 'textMuted' },
  { cssVar: '--text-faint', label: 'Text Faint', colorKey: 'textFaint' },
  { cssVar: '--accent', label: 'Accent', colorKey: 'accent' },
  { cssVar: '--accent-hover', label: 'Accent Hover', colorKey: 'accentHover' },
  { cssVar: '--success', label: 'Success', colorKey: 'success' },
  { cssVar: '--warning', label: 'Warning', colorKey: 'warning' },
  { cssVar: '--error', label: 'Error', colorKey: 'error' },
  { cssVar: '--purple', label: 'Purple', colorKey: 'purple' },
  { cssVar: '--term-bg', label: 'Terminal Background', colorKey: 'termBg' },
  { cssVar: '--term-fg', label: 'Terminal Foreground', colorKey: 'termFg' },
  { cssVar: '--term-cursor', label: 'Terminal Cursor', colorKey: 'termCursor' },
];

export const fallbackHex = '#000000';

export function cssColorToHex(color: string): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return fallbackHex;
    }

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return fallbackHex;
  }
}

export function buildAppliedColors(overrides: Record<string, string>): Record<string, string> {
  const colorMap: Record<string, string> = {};

  for (const token of COLOR_TOKENS) {
    const override = overrides[token.cssVar];
    if (override) {
      colorMap[token.cssVar] = override;
    }
  }

  return colorMap;
}

export function getBaseTheme(activeThemeId: string) {
  return getTheme(activeThemeId === 'custom' ? 'modern' : activeThemeId);
}

export function readSavedColors(colors: AppConfig['customThemeColors']): Record<string, string> {
  return { ...(colors ?? {}) };
}

export function restoreThemeColors(activeThemeId: string): void {
  const baseTheme = getBaseTheme(activeThemeId);

  for (const token of COLOR_TOKENS) {
    document.documentElement.style.setProperty(token.cssVar, baseTheme.colors[token.colorKey] ?? '');
  }
}

export function restoreTokenColor(activeThemeId: string, token: ColorToken): void {
  const baseTheme = getBaseTheme(activeThemeId);
  document.documentElement.style.setProperty(token.cssVar, baseTheme.colors[token.colorKey] ?? '');
}
