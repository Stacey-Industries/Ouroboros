import { cursorTheme } from './cursor';
import { highContrastTheme } from './high-contrast';
import { kiroTheme } from './kiro';
import { lightTheme } from './light';
import { modernTheme } from './modern';
import { retroTheme } from './retro';
import type { Theme } from './types';
import { warpTheme } from './warp';

export type { Theme };
export { cursorTheme, highContrastTheme,kiroTheme, lightTheme, modernTheme, retroTheme, warpTheme };

/**
 * A mutable placeholder for the "Custom" theme.
 * useTheme will merge saved customThemeColors into this object at runtime.
 */
export const customTheme: Theme = {
  id: 'custom',
  name: 'Custom',
  fontFamily: { ...modernTheme.fontFamily },
  colors: { ...modernTheme.colors },
};

export const themes: Record<string, Theme> = {
  retro: retroTheme,
  modern: modernTheme,
  warp: warpTheme,
  cursor: cursorTheme,
  kiro: kiroTheme,
  light: lightTheme,
  'high-contrast': highContrastTheme,
  custom: customTheme,
};

export const defaultThemeId = 'modern';

export function getTheme(id: string): Theme {
  return themes[id] ?? themes[defaultThemeId];
}

/** All built-in themes (excludes custom — it only appears when colors are saved) */
export const themeList: Theme[] = [
  retroTheme,
  modernTheme,
  warpTheme,
  cursorTheme,
  kiroTheme,
  lightTheme,
  highContrastTheme,
];

/** Register a theme from an installed VS Code extension */
export function registerExtensionTheme(theme: Theme): void {
  themes[theme.id] = theme
}

/** Remove a previously registered extension theme */
export function unregisterExtensionTheme(id: string): void {
  delete themes[id]
}

/** Get all registered theme IDs including extension themes */
export function getAllThemeIds(): string[] {
  return Object.keys(themes)
}
