import type { Theme } from './types';

export const retroTheme: Theme = {
  id: 'retro',
  name: 'Retro Terminal',
  fontFamily: {
    mono: '"JetBrains Mono", "Courier New", monospace',
    ui: '"JetBrains Mono", monospace',
  },
  colors: {
    bg: '#0d1117',
    bgSecondary: '#111820',
    bgTertiary: '#1a2433',
    border: '#1e3a2f',
    borderMuted: '#152b22',
    text: '#39ff5a',
    textSecondary: '#2bcc45',
    textMuted: '#1a7a2e',
    textFaint: '#0f4d1e',
    accent: '#39ff5a',
    accentHover: '#5fffa0',
    accentMuted: 'rgba(57, 255, 90, 0.15)',
    success: '#39ff5a',
    warning: '#e5c07b',
    error: '#ff4757',
    purple: '#c678a0',
    purpleMuted: 'rgba(198, 120, 160, 0.2)',
    selection: 'rgba(57, 255, 90, 0.2)',
    focusRing: 'rgba(57, 255, 90, 0.5)',
    termBg: '#0d1117',
    termFg: '#39ff5a',
    termCursor: '#39ff5a',
    termSelection: 'rgba(57, 255, 90, 0.25)',
  },
  effects: {
    scanlines: true,
    glowText: true,
  },
  backgroundGradient:
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 4px)',
};
