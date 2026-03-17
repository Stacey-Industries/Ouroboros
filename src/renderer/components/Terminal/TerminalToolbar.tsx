/**
 * TerminalToolbar -- floating action buttons rendered over the terminal:
 * Sync, Split, Recording, and Multi-line input toggle.
 *
 * Buttons are grouped in a flex container to prevent overlap. Previously
 * each button was individually absolute-positioned with hardcoded `right`
 * offsets which caused Rec and Split to overlap.
 */

import React from 'react'

const BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 4,
  fontFamily: 'var(--font-ui, sans-serif)',
  fontSize: 11,
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
  userSelect: 'none' as const,
  whiteSpace: 'nowrap' as const,
  border: '1px solid var(--border, #333)',
  backgroundColor: 'var(--bg-secondary, #1e1e1e)',
  color: 'var(--text-muted, #888)',
}

interface RecordingVisualState {
  backgroundColor: string
  border: string
  color: string
  label: string
  title: string
}

export function SyncButton({
  syncInput,
  isHovered,
  showSearch,
  onToggleSync,
}: {
  syncInput: boolean
  isHovered: boolean
  showSearch: boolean
  onToggleSync: () => void
}): React.ReactElement | null {
  if (showSearch) return null
  if (!syncInput && !isHovered) return null

  return (
    <button
      onClick={onToggleSync}
      title="Sync input across terminals"
      style={{
        ...BUTTON_STYLE,
        border: syncInput ? '1px solid var(--accent, #58a6ff)' : '1px solid var(--border, #333)',
        backgroundColor: syncInput ? 'rgba(88,166,255,0.15)' : 'var(--bg-secondary, #1e1e1e)',
        color: syncInput ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #888)',
      }}
    >
      <SyncIcon />
      Sync
    </button>
  )
}

export function SplitButton({
  sessionId,
  isHovered,
  showSearch,
  onSplit,
}: {
  sessionId: string
  isHovered: boolean
  showSearch: boolean
  onSplit: (id: string) => void
}): React.ReactElement | null {
  if (!isHovered || showSearch) return null

  return (
    <button
      onClick={() => onSplit(sessionId)}
      title="Split terminal pane"
      style={BUTTON_STYLE}
    >
      <SplitIcon />
      Split
    </button>
  )
}

export function RecordingButton({
  sessionId,
  isRecording,
  isHovered,
  showSearch,
  onToggleRecording,
}: {
  sessionId: string
  isRecording: boolean
  isHovered: boolean
  showSearch: boolean
  onToggleRecording: (id: string) => void
}): React.ReactElement | null {
  if (showSearch) return null
  if (!isRecording && !isHovered) return null

  const visualState = getRecordingVisualState(isRecording)

  return (
    <>
      <button
        onClick={() => onToggleRecording(sessionId)}
        title={visualState.title}
        style={{
          ...BUTTON_STYLE,
          border: visualState.border,
          backgroundColor: visualState.backgroundColor,
          color: visualState.color,
        }}
      >
        <RecordingDot isRecording={isRecording} />
        {visualState.label}
      </button>
      {isRecording && <RecordingPulseStyle />}
    </>
  )
}

export function MultiLineButton({
  isHovered,
  showSearch,
  onClick,
}: {
  isHovered: boolean
  showSearch: boolean
  onClick: () => void
}): React.ReactElement | null {
  if (!isHovered || showSearch) return null

  return (
    <button
      onClick={onClick}
      title="Open multi-line input (Ctrl+Shift+Enter)"
      style={{
        ...BUTTON_STYLE,
        position: 'absolute',
        bottom: 6,
        right: 6,
        zIndex: 10,
      }}
    >
      <MultiLineIcon />
      Multi-line
    </button>
  )
}

function getRecordingVisualState(isRecording: boolean): RecordingVisualState {
  if (isRecording) {
    return {
      title: 'Stop recording',
      label: 'Stop',
      border: '1px solid var(--recording-dot, #e53935)',
      backgroundColor: 'rgba(229,57,53,0.12)',
      color: 'var(--recording-dot, #e53935)',
    }
  }

  return {
    title: 'Start recording terminal session',
    label: 'Rec',
    border: '1px solid var(--border, #333)',
    backgroundColor: 'var(--bg-secondary, #1e1e1e)',
    color: 'var(--text-muted, #888)',
  }
}

function SyncIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 5h8M8 2l3 3-3 3M14 11H6M8 14l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function SplitIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="14" height="12" rx="1.5" strokeLinejoin="round"/>
      <line x1="8" y1="2" x2="8" y2="14" strokeLinecap="round"/>
    </svg>
  )
}

function MultiLineIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="1.5" strokeLinejoin="round"/>
      <path d="M5 6h6M5 8.5h4" strokeLinecap="round"/>
    </svg>
  )
}

function RecordingDot({ isRecording }: { isRecording: boolean }): React.ReactElement {
  return (
    <span style={{
      display: 'inline-block',
      width: 7,
      height: 7,
      borderRadius: '50%',
      backgroundColor: isRecording
        ? 'var(--recording-dot, #e53935)'
        : 'var(--text-muted, #888)',
      flexShrink: 0,
      animation: isRecording ? 'pty-rec-pulse 1.2s ease-in-out infinite' : undefined,
    }} />
  )
}

function RecordingPulseStyle(): React.ReactElement {
  return (
    <style>{`
      @keyframes pty-rec-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `}</style>
  )
}
