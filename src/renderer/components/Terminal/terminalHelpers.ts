/**
 * Terminal helper functions and OSC 133 shell integration types.
 */

// ─── OSC 133 Shell Integration ────────────────────────────────────────────────
//
// OSC 133 (also called "semantic shell integration") marks shell prompt and
// command boundaries with invisible escape sequences:
//   \x1b]133;A\x07  — prompt start
//   \x1b]133;B\x07  — command start (user input begins)
//   \x1b]133;C\x07  — command execution starts (output begins)
//   \x1b]133;D;N\x07 — command ends, N is exit code
//
// We parse these from the raw PTY data stream (before writing to xterm) so we
// can track command boundaries and draw decorations on completed blocks.
//
// If no OSC 133 sequences arrive within OSC133_GRACE_MS of first output the
// feature disables itself silently.

export const OSC133_GRACE_MS = 3000
// eslint-disable-next-line no-control-regex
export const OSC133_RE = /\x1b\]133;([A-D])(?:;(\d+))?\x07/g

export interface CommandBlock {
  /** Buffer row where the prompt started */
  promptRow: number
  /** Buffer row where the command output started */
  outputRow: number | null
  /** Exit code, -1 if still running */
  exitCode: number
  /** Whether this block is complete (133;D received) */
  complete: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
