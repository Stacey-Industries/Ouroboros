/**
 * CommandBlockOverlayBody — renders visual command separators, gutter icons,
 * command labels, timestamps, per-block action bars, and collapse overlays.
 *
 * Phase 3A+3B: Enhanced command block UI (Warp-inspired).
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { CommandBlock } from './useCommandBlocks'
import { CommandBlockActions } from './CommandBlockActions'

export interface CommandBlockOverlayProps {
  blocks: CommandBlock[]
  terminal: Terminal | null
  onToggleCollapse: (blockId: string) => void
  onCopyOutput: (block: CommandBlock) => void
  onCopyCommand: (block: CommandBlock) => void
  activeBlockIndex: number
  sessionId: string
}

type VisibleBlock = { block: CommandBlock; index: number }

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCellHeight(term: Terminal): number {
  try {
    const core = (term as unknown as Record<string, unknown>)._core as Record<string, unknown> | undefined
    const renderService = core?._renderService as Record<string, unknown> | undefined
    const dimensions = renderService?.dimensions as { css?: { cell?: { height?: number } } } | undefined
    if (dimensions?.css?.cell?.height) return dimensions.css.cell.height
  } catch { /* fall through */ }
  return term.element ? term.element.clientHeight / term.rows : 17
}

function formatRelativeTime(timestamp: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (delta < 5) return 'just now'
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86400)}d ago`
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function truncateCommand(cmd: string, max: number = 60): string {
  if (cmd.length <= max) return cmd
  return cmd.slice(0, max - 1) + '\u2026'
}

// ── Styles ───────────────────────────────────────────────────────────────────

const overlayContainerStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  pointerEvents: 'none', zIndex: 5, overflow: 'hidden',
}

const separatorLineStyle: React.CSSProperties = {
  position: 'absolute', left: 28, right: 0, height: 1,
  background: 'var(--border, #333)', opacity: 0.5,
}

const gutterStyle: React.CSSProperties = {
  position: 'absolute', left: 4, width: 20, height: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 7,
}

const commandLabelStyle: React.CSSProperties = {
  position: 'absolute', left: 32, display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent, #58a6ff)',
  opacity: 0.85, userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden',
  textOverflow: 'ellipsis', maxWidth: '50%',
}

const timestampStyle: React.CSSProperties = {
  position: 'absolute', right: 6, fontSize: 9,
  fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted, #666)',
  opacity: 0.7, userSelect: 'none',
}

const actionsContainerStyle: React.CSSProperties = {
  position: 'absolute', right: 80, display: 'flex', alignItems: 'center',
  opacity: 0, transition: 'opacity 0.15s ease',
}

const collapsedOverlayStyle: React.CSSProperties = {
  position: 'absolute', left: 28, right: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-secondary, rgba(30,30,30,0.85))',
  backdropFilter: 'blur(2px)',
  color: 'var(--text-muted, #888)', fontSize: 11,
  fontFamily: 'var(--font-mono, monospace)',
  cursor: 'pointer', pointerEvents: 'auto', userSelect: 'none',
  borderLeft: '2px solid var(--border, #444)',
}

// ── Gutter Icon ──────────────────────────────────────────────────────────────

function GutterIcon({ block }: { block: CommandBlock }): React.ReactElement {
  if (!block.complete) {
    // Spinning loader for running command
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: 'spin 1s linear infinite' }}>
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--accent, #58a6ff)" strokeWidth="2" strokeDasharray="20 18" strokeLinecap="round" />
      </svg>
    )
  }
  if (block.exitCode === 0 || block.exitCode === undefined) {
    // Green checkmark circle
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="var(--success, #4caf50)" strokeWidth="1.5" opacity="0.8" />
        <path d="M5 8l2 2 4-4" stroke="var(--success, #4caf50)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  // Red X circle for non-zero exit code
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--error, #e53935)" strokeWidth="1.5" opacity="0.8" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--error, #e53935)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Spin keyframe (injected once) ────────────────────────────────────────────

let spinStyleInjected = false
function ensureSpinKeyframe(): void {
  if (spinStyleInjected) return
  spinStyleInjected = true
  const style = document.createElement('style')
  style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}

// ── Single Block Decoration ──────────────────────────────────────────────────

function CommandBlockDecoration({
  block, index, cellHeight, viewportY, activeBlockIndex,
  onToggleCollapse, onCopyOutput, onCopyCommand, sessionId,
}: {
  block: CommandBlock
  index: number
  cellHeight: number
  viewportY: number
  activeBlockIndex: number
  onToggleCollapse: (blockId: string) => void
  onCopyOutput: (block: CommandBlock) => void
  onCopyCommand: (block: CommandBlock) => void
  sessionId: string
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const isActive = index === activeBlockIndex
  const separatorY = (block.startLine - viewportY) * cellHeight

  // Left border color for the output region
  const borderColor = block.exitCode !== undefined && block.exitCode !== 0
    ? 'var(--error, #e53935)'
    : !block.complete
      ? 'var(--accent, #58a6ff)'
      : 'var(--success, #4caf50)'

  const outputHeight = block.collapsed
    ? cellHeight
    : (block.endLine - block.startLine + 1) * cellHeight

  const collapsedLines = block.collapsed
    ? block.endLine - block.outputStartLine
    : 0

  return (
    <div
      style={{
        position: 'absolute',
        top: separatorY,
        left: 0, right: 0,
        height: outputHeight,
        pointerEvents: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Separator line */}
      <div style={{ ...separatorLineStyle, top: 0 }} />

      {/* Left border for output region */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: 2,
        height: '100%',
        background: borderColor,
        opacity: isActive ? 0.9 : 0.4,
        transition: 'opacity 0.15s ease',
      }} />

      {/* Gutter icon */}
      <div style={{ ...gutterStyle, top: (cellHeight - 20) / 2 }}>
        <GutterIcon block={block} />
      </div>

      {/* Command text label */}
      {block.command && (
        <div style={{ ...commandLabelStyle, top: (cellHeight - 14) / 2, height: 14 }} title={block.command}>
          {truncateCommand(block.command)}
        </div>
      )}

      {/* Timestamp (relative) */}
      <div style={{ ...timestampStyle, top: (cellHeight - 12) / 2, height: 12, lineHeight: '12px' }}>
        <RelativeTimestamp timestamp={block.timestamp} />
        {block.duration !== undefined && block.duration > 500 && (
          <span style={{ marginLeft: 6, color: block.duration > 10000 ? 'var(--warning, #f0a030)' : undefined }}>
            {formatDuration(block.duration)}
          </span>
        )}
      </div>

      {/* Actions bar (appears on hover) */}
      <div style={{
        ...actionsContainerStyle,
        top: (cellHeight - 18) / 2,
        opacity: hovered ? 1 : 0,
        pointerEvents: hovered ? 'auto' : 'none',
      }}>
        <CommandBlockActions
          block={block}
          sessionId={sessionId}
          onCopyOutput={onCopyOutput}
          onCopyCommand={onCopyCommand}
          onToggleCollapse={onToggleCollapse}
        />
      </div>

      {/* Collapsed overlay */}
      {block.collapsed && collapsedLines > 0 && (
        <div
          style={{
            ...collapsedOverlayStyle,
            top: cellHeight,
            height: '100%',
            borderLeftColor: borderColor,
          }}
          onClick={() => onToggleCollapse(block.id)}
          title="Click to expand"
        >
          {collapsedLines} line{collapsedLines !== 1 ? 's' : ''} collapsed — click to expand
        </div>
      )}
    </div>
  )
}

// ── Relative Timestamp (updates periodically) ────────────────────────────────

function RelativeTimestamp({ timestamp }: { timestamp: number }): React.ReactElement {
  const [text, setText] = useState(() => formatRelativeTime(timestamp))
  useEffect(() => {
    const id = setInterval(() => setText(formatRelativeTime(timestamp)), 5000)
    return () => clearInterval(id)
  }, [timestamp])
  return <span>{text}</span>
}

// ── Visible Blocks Hook ──────────────────────────────────────────────────────

function useVisibleBlocks(blocks: CommandBlock[], terminal: Terminal | null): VisibleBlock[] {
  return useMemo(() => {
    if (!terminal || blocks.length === 0) return []
    const viewportTop = terminal.buffer.active.viewportY
    const viewportBottom = viewportTop + terminal.rows
    return blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.endLine >= viewportTop && block.startLine <= viewportBottom)
  }, [blocks, terminal])
}

// ── Scroll-aware position updates ────────────────────────────────────────────

function useScrollViewportY(terminal: Terminal | null): number {
  const [viewportY, setViewportY] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!terminal) return
    setViewportY(terminal.buffer.active.viewportY)

    const scrollDisposable = terminal.onScroll(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setViewportY(terminal.buffer.active.viewportY)
      })
    })

    const writeDisposable = terminal.onWriteParsed(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setViewportY(terminal.buffer.active.viewportY)
      })
    })

    return () => {
      scrollDisposable.dispose()
      writeDisposable.dispose()
      cancelAnimationFrame(rafRef.current)
    }
  }, [terminal])

  return viewportY
}

// ── Main Body ────────────────────────────────────────────────────────────────

export function CommandBlockOverlayBody({
  activeBlockIndex, blocks, onCopyOutput, onCopyCommand, onToggleCollapse, terminal, sessionId,
}: CommandBlockOverlayProps): React.ReactElement | null {
  ensureSpinKeyframe()

  const visibleBlocks = useVisibleBlocks(blocks, terminal)
  const viewportY = useScrollViewportY(terminal)

  if (!terminal || visibleBlocks.length === 0) return null

  const cellHeight = getCellHeight(terminal)

  return (
    <div style={overlayContainerStyle}>
      {visibleBlocks.map(({ block, index }) => (
        <CommandBlockDecoration
          key={block.id}
          block={block}
          index={index}
          cellHeight={cellHeight}
          viewportY={viewportY}
          activeBlockIndex={activeBlockIndex}
          onToggleCollapse={onToggleCollapse}
          onCopyOutput={onCopyOutput}
          onCopyCommand={onCopyCommand}
          sessionId={sessionId}
        />
      ))}
    </div>
  )
}
