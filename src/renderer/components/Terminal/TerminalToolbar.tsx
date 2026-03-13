/**
 * TerminalToolbar — floating action buttons rendered over the terminal:
 * Sync, Split, Recording, and Multi-line input toggle.
 */

import React from 'react'

// ── Shared button style ─────────────────────────────────────────────────────

const BASE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  zIndex: 10,
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
}

const MUTED_STYLE: React.CSSProperties = {
  ...BASE_STYLE,
  border: '1px solid var(--border, #333)',
  backgroundColor: 'var(--bg-secondary, #1e1e1e)',
  color: 'var(--text-muted, #888)',
}

// ── Sub-components ──────────────────────────────────────────────────────────

export function SyncButton({ syncInput, isHovered, showSearch, onToggleSync }: {
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
        ...BASE_STYLE,
        right: isHovered ? 155 : 6,
        border: syncInput
          ? '1px solid var(--accent, #58a6ff)'
          : '1px solid var(--border, #333)',
        backgroundColor: syncInput
          ? 'rgba(88,166,255,0.15)'
          : 'var(--bg-secondary, #1e1e1e)',
        color: syncInput
          ? 'var(--accent, #58a6ff)'
          : 'var(--text-muted, #888)',
      }}
    >
      <SyncIcon />
      Sync
    </button>
  )
}

export function SplitButton({ sessionId, isHovered, showSearch, onSplit }: {
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
      style={{ ...MUTED_STYLE, right: isHovered ? 110 : 6 }}
    >
      Split
    </button>
  )
}

export function RecordingButton({ sessionId, isRecording, isHovered, showSearch, onToggleRecording }: {
  sessionId: string
  isRecording: boolean
  isHovered: boolean
  showSearch: boolean
  onToggleRecording: (id: string) => void
}): React.ReactElement | null {
  if (!isRecording && !isHovered) return null
  return (
    <>
      <button
        onClick={() => onToggleRecording(sessionId)}
        title={isRecording ? 'Stop recording' : 'Start recording terminal session'}
        style={{
          ...BASE_STYLE,
          right: isHovered && !showSearch ? 70 : 6,
          border: isRecording
            ? '1px solid var(--recording-dot, #e53935)'
            : '1px solid var(--border, #333)',
          backgroundColor: isRecording
            ? 'rgba(229,57,53,0.12)'
            : 'var(--bg-secondary, #1e1e1e)',
          color: isRecording
            ? 'var(--recording-dot, #e53935)'
            : 'var(--text-muted, #888)',
          transition: 'opacity 0.15s ease',
        }}
      >
        <RecordingDot isRecording={isRecording} />
        {isRecording ? 'Stop' : 'Rec'}
      </button>
      {isRecording && <RecordingPulseStyle />}
    </>
  )
}

export function MultiLineButton({ isHovered, showSearch, onClick }: {
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
        ...MUTED_STYLE,
        top: undefined,
        bottom: 6,
        right: 6,
      }}
    >
      <MultiLineIcon />
      Multi-line
    </button>
  )
}

// ── Icons ───────────────────────────────────────────────────────────────────

function SyncIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 5h8M8 2l3 3-3 3M14 11H6M8 14l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
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
