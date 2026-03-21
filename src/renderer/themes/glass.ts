import type { Theme } from './types';

export const glassTheme: Theme = {
  id: 'glass',
  name: 'Glass',
  fontFamily: {
    mono: '"Geist Mono", "JetBrains Mono", monospace',
    ui: '"Inter", system-ui, -apple-system, sans-serif',
  },
  colors: {
    bg: '#050507',
    bgSecondary: 'rgba(16, 16, 20, 0.66)',
    bgTertiary: 'rgba(28, 28, 34, 0.52)',
    border: 'rgba(255, 255, 255, 0.10)',
    borderMuted: 'rgba(255, 255, 255, 0.05)',
    text: '#f5f7ff',
    textSecondary: '#c3cae6',
    textMuted: '#8f97b8',
    textFaint: '#636b8a',
    accent: '#58a6ff',
    accentHover: '#7ab8ff',
    accentMuted: 'rgba(88, 166, 255, 0.16)',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    purple: '#b794f6',
    purpleMuted: 'rgba(183, 148, 246, 0.18)',
    selection: 'rgba(88, 166, 255, 0.24)',
    focusRing: 'rgba(88, 166, 255, 0.55)',
    termBg: 'rgba(6, 6, 10, 0.82)',
    termFg: '#eef3ff',
    termCursor: '#58a6ff',
    termSelection: 'rgba(88, 166, 255, 0.28)',
  },
  backgroundGradient:
    'radial-gradient(ellipse at 16% 16%, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.03) 12%, transparent 42%), radial-gradient(ellipse at 84% 12%, rgba(88, 166, 255, 0.14) 0%, rgba(88, 166, 255, 0.05) 12%, transparent 40%), radial-gradient(ellipse at 72% 86%, rgba(183, 148, 246, 0.10) 0%, transparent 34%), radial-gradient(ellipse at 50% 48%, rgba(8, 8, 12, 0.40) 0%, transparent 66%), radial-gradient(ellipse at 50% 110%, rgba(255, 255, 255, 0.04) 0%, transparent 32%)',
};
