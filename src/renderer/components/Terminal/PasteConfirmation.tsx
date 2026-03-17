/**
 * PasteConfirmBanner — confirmation banner shown at the bottom of the terminal
 * when the user tries to paste text exceeding the safety threshold.
 */

import React from 'react'

export const PASTE_CONFIRM_THRESHOLD = 1000

interface PasteConfirmBannerProps {
  text: string
  onConfirm: () => void
  onConfirmSingleLine: () => void
  onCancel: () => void
}

const bannerStyle: React.CSSProperties = {
  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 14px',
  backgroundColor: 'var(--bg-secondary, #1e1e1e)',
  borderTop: '1px solid var(--border, #333)',
  fontFamily: 'var(--font-ui, sans-serif)', fontSize: 12,
  color: 'var(--text, #e0e0e0)',
  boxShadow: '0 -2px 8px rgba(0,0,0,0.2)',
}

const confirmBtnStyle: React.CSSProperties = {
  padding: '3px 12px', borderRadius: 4, border: 'none',
  backgroundColor: 'var(--accent, #58a6ff)',
  color: 'var(--bg, #0d0d0d)',
  fontFamily: 'var(--font-ui, sans-serif)', fontSize: 12,
  cursor: 'pointer', fontWeight: 600,
}

const singleLineBtnStyle: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 4,
  border: '1px solid var(--accent, #58a6ff)',
  backgroundColor: 'transparent',
  color: 'var(--accent, #58a6ff)',
  fontFamily: 'var(--font-ui, sans-serif)', fontSize: 12,
  cursor: 'pointer',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 4,
  border: '1px solid var(--border, #333)',
  backgroundColor: 'transparent',
  color: 'var(--text-muted, #888)',
  fontFamily: 'var(--font-ui, sans-serif)', fontSize: 12,
  cursor: 'pointer',
}

function hasNewlines(text: string): boolean {
  return text.includes('\n') || text.includes('\r')
}

function formatLineCount(text: string): string {
  const lines = text.split(/\r?\n/).length
  return lines > 1 ? ` (${lines} lines)` : ''
}

export function PasteConfirmBanner({ text, onConfirm, onConfirmSingleLine, onCancel }: PasteConfirmBannerProps): React.ReactElement {
  const multiline = hasNewlines(text)

  return (
    <div style={bannerStyle}>
      <span style={{ flex: 1, color: 'var(--text-muted, #888)' }}>
        Paste {text.length.toLocaleString()} characters{formatLineCount(text)}?
      </span>
      <button onClick={onConfirm} autoFocus style={confirmBtnStyle}>Paste</button>
      {multiline && (
        <button onClick={onConfirmSingleLine} style={singleLineBtnStyle}>
          Single line
        </button>
      )}
      <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
    </div>
  )
}
