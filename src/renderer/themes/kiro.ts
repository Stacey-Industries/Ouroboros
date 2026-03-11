import type { Theme } from './types';

export const kiroTheme: Theme = {
  id: 'kiro',
  name: 'Kiro',
  fontFamily: {
    mono: '"IBM Plex Mono", "JetBrains Mono", monospace',
    ui: '"IBM Plex Sans", "IBM Plex Mono", monospace',
  },
  colors: {
    bg: '#030c10',
    bgSecondary: '#08151d',
    bgTertiary: '#0e2030',
    border: '#0d3347',
    borderMuted: '#082030',
    text: '#e0f7ff',
    textSecondary: '#7ec8e3',
    textMuted: '#2e6a87',
    textFaint: '#154060',
    accent: '#00d4ff',
    accentHover: '#40e8ff',
    accentMuted: 'rgba(0, 212, 255, 0.12)',
    success: '#00e5a0',
    warning: '#ffcc44',
    error: '#ff4d6a',
    purple: '#9d6fff',
    purpleMuted: 'rgba(157, 111, 255, 0.2)',
    selection: 'rgba(0, 212, 255, 0.18)',
    focusRing: 'rgba(0, 212, 255, 0.5)',
    termBg: '#020b0f',
    termFg: '#e0f7ff',
    termCursor: '#00d4ff',
    termSelection: 'rgba(0, 212, 255, 0.25)',
  },
  backgroundGradient:
    'linear-gradient(135deg, rgba(0,50,70,0.25) 0%, rgba(3,12,16,0) 60%), radial-gradient(ellipse at 80% 20%, rgba(0,100,130,0.12) 0%, transparent 50%)',
};
