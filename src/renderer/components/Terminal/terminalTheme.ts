/**
 * terminalTheme — helper functions for reading CSS variables and building
 * xterm.js theme objects from the current Ouroboros theme.
 */

export function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export type XtermTheme = ReturnType<typeof buildXtermTheme>

/** Default ANSI 16 color palette for xterm */
const ANSI_COLORS = {
  black: '#000000',
  red: '#cc5555',
  green: '#55aa55',
  yellow: '#aaaa55',
  blue: '#5555cc',
  magenta: '#aa55aa',
  cyan: '#55aaaa',
  white: '#aaaaaa',
  brightBlack: '#555555',
  brightRed: '#ff5555',
  brightGreen: '#55ff55',
  brightYellow: '#ffff55',
  brightBlue: '#5555ff',
  brightMagenta: '#ff55ff',
  brightCyan: '#55ffff',
  brightWhite: '#ffffff',
} as const

export function buildXtermTheme(): typeof ANSI_COLORS & {
  background: string; foreground: string
  cursor: string; cursorAccent: string
  selectionBackground: string
} {
  const bg = getCssVar('--term-bg') || '#0d0d0d'
  const fg = getCssVar('--term-fg') || '#e0e0e0'

  return {
    background: bg,
    foreground: fg,
    cursor: getCssVar('--term-cursor') || '#e0e0e0',
    cursorAccent: bg,
    selectionBackground: getCssVar('--term-selection') || 'rgba(255,255,255,0.2)',
    ...ANSI_COLORS,
  }
}
