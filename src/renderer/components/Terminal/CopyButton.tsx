/**
 * CopyButton -- floating copy button for the terminal toolbar.
 *
 * Lives inside the toolbar flex container alongside Sync/Split/Rec.
 * Copies the current selection, or the last output block if nothing is selected.
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

function CopyIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
    </svg>
  )
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 7 12 13 4" />
    </svg>
  )
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

  if (!visible) return <></>;

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy terminal output'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 4,
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 11,
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        border: copied ? '1px solid var(--accent, #58a6ff)' : '1px solid var(--border, #333)',
        backgroundColor: copied ? 'rgba(88,166,255,0.15)' : 'var(--bg-secondary, #1e1e1e)',
        color: copied ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #888)',
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
