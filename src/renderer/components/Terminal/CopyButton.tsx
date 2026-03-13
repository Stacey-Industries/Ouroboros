/**
 * CopyButton — floating copy button overlay for the terminal.
 *
 * Shown in the top-right corner on hover. Copies the current selection,
 * or the last output block if nothing is selected.
 */

import React, { useState } from 'react'
import type { Terminal } from '@xterm/xterm'

interface CopyButtonProps {
  terminal: Terminal | null
  visible: boolean
}

/** Extract up to 50 lines before cursor, trimming trailing blanks. */
function extractRecentOutput(terminal: Terminal): string {
  const buffer = terminal.buffer.active
  const cursorRow = buffer.cursorY
  const lines: string[] = []
  const startRow = Math.max(0, cursorRow - 50)
  for (let i = startRow; i < cursorRow; i++) {
    const line = buffer.getLine(i)
    lines.push(line ? line.translateToString(true) : '')
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }
  return lines.join('\n')
}

function getTextToCopy(terminal: Terminal): string {
  return terminal.getSelection() || extractRecentOutput(terminal)
}

export function CopyButton({ terminal, visible }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false)

  function handleCopy(): void {
    if (!terminal) return
    const text = getTextToCopy(terminal)
    if (!text) return
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy terminal output'}
      className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-2 py-0.5
        rounded border border-[var(--border)] bg-[var(--bg-secondary)]
        font-[var(--font-ui)] text-[11px] cursor-pointer select-none whitespace-nowrap
        shadow-sm transition-opacity duration-150"
      style={{
        color: copied ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #888)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
