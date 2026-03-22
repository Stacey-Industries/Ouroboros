/**
 * CommandBlockActions — hover action bar for command blocks.
 *
 * Appears on hover over a command block separator:
 * - Copy Output: serialize output rows to clipboard
 * - Copy Command: copy command text to clipboard
 * - Re-run: write command text + newline to PTY
 * - Collapse/Expand: toggle output row visibility
 */

import React, { useCallback, useState } from 'react'

import type { CommandBlock } from './useCommandBlocks'

export interface CommandBlockActionsProps {
  block: CommandBlock
  sessionId: string
  onCopyOutput: (block: CommandBlock) => void
  onCopyCommand: (block: CommandBlock) => void
  onToggleCollapse: (blockId: string) => void
  onExplainError?: (block: CommandBlock) => void
}

const actionsBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  pointerEvents: 'auto',
}

const actionButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid transparent',
  cursor: 'pointer',
  padding: '1px 5px',
  fontSize: 10,
  lineHeight: 1.4,
  borderRadius: 3,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font-ui, system-ui)',
  transition: 'all 0.1s ease',
}

const actionButtonHoverStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: 'rgba(60,60,60,0.8)',
}

function CopyIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M3 11V3a1 1 0 011-1h8" />
    </svg>
  )
}

function RerunIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 8a6 6 0 0111.5-2.3" strokeLinecap="round" />
      <path d="M14 8a6 6 0 01-11.5 2.3" strokeLinecap="round" />
      <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExplainIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v4" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CollapseIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg
      width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ActionButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      className={hovered ? 'text-text-semantic-primary border-border-semantic' : 'text-text-semantic-muted'}
      style={hovered ? actionButtonHoverStyle : actionButtonStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  )
}

export function CommandBlockActions({
  block,
  sessionId,
  onCopyOutput,
  onCopyCommand,
  onToggleCollapse,
  onExplainError,
}: CommandBlockActionsProps): React.ReactElement {
  const handleRerun = useCallback(() => {
    if (block.command) {
      void window.electronAPI.pty.write(sessionId, block.command + '\n')
    }
  }, [block.command, sessionId])

  const canCollapse = block.complete && block.endLine - block.startLine > 1

  return (
    <div style={actionsBarStyle}>
      {block.command && (
        <ActionButton onClick={() => onCopyCommand(block)} title="Copy command">
          <CopyIcon /> Cmd
        </ActionButton>
      )}
      {block.complete && (
        <ActionButton onClick={() => onCopyOutput(block)} title="Copy output">
          <CopyIcon /> Output
        </ActionButton>
      )}
      {block.command && (
        <ActionButton onClick={handleRerun} title="Re-run command">
          <RerunIcon /> Re-run
        </ActionButton>
      )}
      {block.complete && block.exitCode !== undefined && block.exitCode !== 0 && onExplainError && (
        <ActionButton onClick={() => onExplainError(block)} title="Explain this error with AI">
          <ExplainIcon /> Explain
        </ActionButton>
      )}
      {canCollapse && (
        <ActionButton
          onClick={() => onToggleCollapse(block.id)}
          title={block.collapsed ? 'Expand output' : 'Collapse output'}
        >
          <CollapseIcon collapsed={block.collapsed} />
          {block.collapsed ? 'Expand' : 'Collapse'}
        </ActionButton>
      )}
    </div>
  )
}
