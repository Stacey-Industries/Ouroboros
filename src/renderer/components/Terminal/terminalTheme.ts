/**
 * terminalTheme — helper functions for reading CSS variables and building
 * xterm.js theme objects from the current Ouroboros theme.
 */

export function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function buildXtermTheme(): {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
} {
  const bg = getCssVar('--term-bg') || '#0d0d0d'
  const fg = getCssVar('--term-fg') || '#e0e0e0'
  const cursor = getCssVar('--term-cursor') || '#e0e0e0'
  const selection = getCssVar('--term-selection') || 'rgba(255,255,255,0.2)'

  return {
    background: bg,
    foreground: fg,
    cursor,
    cursorAccent: bg,
    selectionBackground: selection,
    // ANSI 16 — lean on system defaults, only override the non-negotiable ones
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
  }
}
