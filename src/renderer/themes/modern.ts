import type { Theme } from './types';

export const modernTheme: Theme = {
  id: 'modern',
  name: 'Modern',
  fontFamily: {
    mono: '"Geist Mono", "JetBrains Mono", monospace',
    ui: '"Inter", system-ui, -apple-system, sans-serif',
  },
  colors: {
    bg: '#111113',
    bgSecondary: '#18181b',
    bgTertiary: '#27272a',
    border: '#3f3f46',
    borderMuted: '#2d2d33',
    text: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#52525b',
    textFaint: '#3f3f46',
    accent: '#818cf8',
    accentHover: '#a5b4fc',
    accentMuted: 'rgba(129, 140, 248, 0.15)',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    purple: '#a78bfa',
    purpleMuted: 'rgba(167, 139, 250, 0.2)',
    selection: 'rgba(99, 102, 241, 0.25)',
    focusRing: 'rgba(129, 140, 248, 0.5)',
    termBg: '#0c0c0e',
    termFg: '#e4e4e7',
    termCursor: '#818cf8',
    termSelection: 'rgba(129, 140, 248, 0.3)',
  },
  backgroundGradient:
    'linear-gradient(160deg, rgba(24,24,27,0) 0%, rgba(10,10,12,0.6) 100%)',
};
