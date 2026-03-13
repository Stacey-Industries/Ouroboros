/**
 * SelectionTooltip — floating tooltip shown when terminal text selection
 * looks like a URL or file path. Offers to open the resource.
 */

import React from 'react'

export type TooltipAction = 'url' | 'file' | null

export interface SelectionTooltipState {
  visible: boolean
  x: number
  y: number
  text: string
  action: TooltipAction
}

export const INITIAL_SELECTION_TOOLTIP: SelectionTooltipState = {
  visible: false,
  x: 0,
  y: 0,
  text: '',
  action: null,
}

export function classifySelection(text: string): TooltipAction {
  const trimmed = text.trim()
  if (!trimmed) return null
  // URL: starts with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) return 'url'
  // File path: contains a slash or backslash and a dot extension
  if (/(\/|\\)/.test(trimmed) && /\.\w+/.test(trimmed)) return 'file'
  return null
}

interface SelectionTooltipProps {
  state: SelectionTooltipState
  onOpenUrl: (url: string) => void
  onOpenFile: (filePath: string) => void
  onDismiss: () => void
}

export function SelectionTooltip({
  state,
  onOpenUrl,
  onOpenFile,
  onDismiss,
}: SelectionTooltipProps): React.ReactElement | null {
  if (!state.visible || !state.action) return null

  const label = state.action === 'url' ? 'Open link' : 'Open file'

  function handleClick(e: React.MouseEvent): void {
    e.stopPropagation()
    if (state.action === 'url') {
      onOpenUrl(state.text.trim())
    } else {
      onOpenFile(state.text.trim())
    }
    onDismiss()
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 1000,
        padding: '3px 10px',
        borderRadius: 4,
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        border: '1px solid var(--accent, #58a6ff)',
        color: 'var(--accent, #58a6ff)',
        fontFamily: 'var(--font-ui, sans-serif)',
        fontSize: 11,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={handleClick}
    >
      {label}
    </div>
  )
}
