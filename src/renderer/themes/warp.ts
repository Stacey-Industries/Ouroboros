import type { Theme } from './types';

export const warpTheme: Theme = {
  id: 'warp',
  name: 'Warp',
  fontFamily: {
    mono: '"Hack", "Fira Code", "JetBrains Mono", monospace',
    ui: '"Hack", "Fira Code", monospace',
  },
  colors: {
    bg: '#1a1612',
    bgSecondary: '#211d18',
    bgTertiary: '#2e2720',
    border: '#3d3328',
    borderMuted: '#2c2419',
    text: '#f0e6d3',
    textSecondary: '#c4aa88',
    textMuted: '#7a6650',
    textFaint: '#4a3b2c',
    accent: '#f97316',
    accentHover: '#fb923c',
    accentMuted: 'rgba(249, 115, 22, 0.15)',
    success: '#86efac',
    warning: '#fbbf24',
    error: '#f87171',
    purple: '#d4729a',
    purpleMuted: 'rgba(212, 114, 154, 0.2)',
    selection: 'rgba(249, 115, 22, 0.2)',
    focusRing: 'rgba(249, 115, 22, 0.5)',
    termBg: '#140f0b',
    termFg: '#f0e6d3',
    termCursor: '#f97316',
    termSelection: 'rgba(249, 115, 22, 0.3)',
  },
  backgroundGradient:
    'radial-gradient(ellipse at 0% 0%, rgba(100,50,180,0.08) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(80,30,140,0.07) 0%, transparent 55%)',
};
