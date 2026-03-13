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

export function CopyButton({ terminal, visible }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false)

  function handleCopy(): void {
    if (!terminal) return

    const selection = terminal.getSelection()
    let textToCopy = selection

    if (!textToCopy) {
      // Nothing selected — copy last output block (lines before current cursor row)
      const buffer = terminal.buffer.active
      const cursorRow = buffer.cursorY
      // Collect up to 50 lines before cursor, trimming trailing empty lines
      const lines: string[] = []
      const startRow = Math.max(0, cursorRow - 50)
      for (let i = startRow; i < cursorRow; i++) {
        const line = buffer.getLine(i)
        lines.push(line ? line.translateToString(true) : '')
      }
      // Remove trailing blank lines
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop()
      }
      textToCopy = lines.join('\n')
    }

    if (textToCopy) {
      void navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy terminal output'}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 4,
        border: '1px solid var(--border, #333)',
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        color: copied ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #888)',
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 11,
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.15s ease, color 0.1s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
