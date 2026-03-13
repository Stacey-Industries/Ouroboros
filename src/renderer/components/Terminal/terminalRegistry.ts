/**
 * terminalRegistry.ts — Global registry of active xterm Terminal instances.
 *
 * TerminalInstance registers its xterm.js Terminal here on mount and
 * unregisters on unmount. This allows other parts of the app (e.g.
 * useIdeToolResponder) to read terminal buffer content without needing
 * to thread refs through the entire component tree.
 */

import type { Terminal } from '@xterm/xterm'

/** Map of sessionId -> xterm Terminal instance */
const registry = new Map<string, Terminal>()

export function registerTerminal(sessionId: string, terminal: Terminal): void {
  registry.set(sessionId, terminal)
}

export function unregisterTerminal(sessionId: string): void {
  registry.delete(sessionId)
}

/**
 * Read the last N lines from a terminal's buffer.
 * If sessionId is not provided, reads from the first registered terminal.
 */
export function getTerminalLines(sessionId?: string, lineCount = 200): string[] {
  let term: Terminal | undefined

  if (sessionId) {
    term = registry.get(sessionId)
  } else {
    // Default to first registered terminal
    const first = registry.values().next()
    term = first.done ? undefined : first.value
  }

  if (!term) return []

  const buffer = term.buffer.active
  const totalRows = buffer.length
  const startRow = Math.max(0, totalRows - lineCount)
  const lines: string[] = []

  for (let i = startRow; i < totalRows; i++) {
    const line = buffer.getLine(i)
    if (line) {
      lines.push(line.translateToString(true))
    }
  }

  // Trim trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  return lines
}
