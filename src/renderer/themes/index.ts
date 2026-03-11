import type { Theme } from './types';
import { retroTheme } from './retro';
import { modernTheme } from './modern';
import { warpTheme } from './warp';
import { cursorTheme } from './cursor';
import { kiroTheme } from './kiro';

export type { Theme };
export { retroTheme, modernTheme, warpTheme, cursorTheme, kiroTheme };

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
];
