/**
 * CommandBlockOverlay — renders visual block decorations on top of the xterm canvas.
 *
 * Each visible command block gets:
 * - A thin colored left border (accent for success, red for error)
 * - Command text highlighted at the top
 * - Collapse/expand toggle (right side)
 * - Copy output button (right side)
 * - Timestamp badge
 *
 * Only blocks visible in the current viewport are rendered (performance).
 * Positioned absolutely relative to the terminal container.
 */

import React, { useCallback, useMemo } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { CommandBlock } from './useCommandBlocks'

interface CommandBlockOverlayProps {
  blocks: CommandBlock[]
  terminal: Terminal | null
  onToggleCollapse: (blockId: string) => void
  onCopyOutput: (block: CommandBlock) => void
  activeBlockIndex: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCellHeight(term: Terminal): number {
  // Access internal render dimensions for accurate cell height
  try {
    const core = (term as any)._core
    if (core?._renderService?.dimensions?.css?.cell?.height) {
      return core._renderService.dimensions.css.cell.height
    }
  } catch { /* fallback */ }
  // Fallback: estimate from container
  const el = term.element
  if (el) {
    return el.clientHeight / term.rows
  }
  return 17 // reasonable default for 13px font
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CommandBlockOverlay({
  blocks,
  terminal,
  onToggleCollapse,
  onCopyOutput,
  activeBlockIndex,
}: CommandBlockOverlayProps): React.ReactElement | null {
  if (!terminal || blocks.length === 0) return null

  const cellHeight = getCellHeight(terminal)
  const viewportY = terminal.buffer.active.viewportY
  const viewportRows = terminal.rows

  // Only render blocks visible in the viewport
  const visibleBlocks = useMemo(() => {
    const viewTop = viewportY
    const viewBottom = viewportY + viewportRows

    return blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => {
        // Block is visible if any part of it overlaps with the viewport
        return block.endLine >= viewTop && block.startLine <= viewBottom
      })
  }, [blocks, viewportY, viewportRows])

  if (visibleBlocks.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'hidden',
      }}
    >
      {visibleBlocks.map(({ block, index }) => {
        const topOffset = (block.startLine - viewportY) * cellHeight
        const blockHeight = block.collapsed
          ? cellHeight // collapsed: just show the command line
          : (block.endLine - block.startLine + 1) * cellHeight

        const isActive = index === activeBlockIndex
        const isError = block.exitCode !== undefined && block.exitCode !== 0
        const borderColor = isError
          ? 'var(--error, #e53935)'
          : isActive
            ? 'var(--accent, #58a6ff)'
            : 'var(--border, #444)'

        return (
          <div
            key={block.id}
            style={{
              position: 'absolute',
              top: topOffset,
              left: 0,
              right: 0,
              height: blockHeight,
              borderLeft: `2px solid ${borderColor}`,
              background: isActive
                ? 'rgba(88,166,255,0.04)'
                : 'transparent',
              transition: 'background 0.15s ease',
              pointerEvents: 'none',
            }}
          >
            {/* Block header — command line with controls */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                height: cellHeight,
                pointerEvents: 'auto',
                zIndex: 6,
              }}
            >
              {/* Timestamp */}
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted, #666)',
                  fontFamily: 'var(--font-mono, monospace)',
                  userSelect: 'none',
                  opacity: 0.7,
                }}
              >
                {formatTimestamp(block.timestamp)}
              </span>

              {/* Duration badge */}
              {block.duration !== undefined && block.duration > 500 && (
                <span
                  style={{
                    fontSize: 9,
                    color: block.duration > 10000
                      ? 'var(--warning, #f0a030)'
                      : 'var(--text-muted, #666)',
                    fontFamily: 'var(--font-mono, monospace)',
                    userSelect: 'none',
                    opacity: 0.7,
                  }}
                >
                  {formatDuration(block.duration)}
                </span>
              )}

              {/* Exit code badge */}
              {block.exitCode !== undefined && block.exitCode !== 0 && (
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--error, #e53935)',
                    fontFamily: 'var(--font-mono, monospace)',
                    userSelect: 'none',
                    padding: '0 3px',
                    borderRadius: 2,
                    background: 'rgba(229,57,53,0.1)',
                  }}
                >
                  exit {block.exitCode}
                </span>
              )}

              {/* Copy output button */}
              {block.complete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopyOutput(block)
                  }}
                  title="Copy command output"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #666)',
                    cursor: 'pointer',
                    padding: '1px 3px',
                    fontSize: 11,
                    lineHeight: 1,
                    borderRadius: 2,
                    opacity: 0.6,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1' }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.6' }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="5" y="5" width="9" height="9" rx="1" />
                    <path d="M3 11V3a1 1 0 011-1h8" />
                  </svg>
                </button>
              )}

              {/* Collapse/expand toggle */}
              {block.complete && block.endLine - block.startLine > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleCollapse(block.id)
                  }}
                  title={block.collapsed ? 'Expand block' : 'Collapse block'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #666)',
                    cursor: 'pointer',
                    padding: '1px 3px',
                    fontSize: 11,
                    lineHeight: 1,
                    borderRadius: 2,
                    opacity: 0.6,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1' }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.6' }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    style={{
                      transform: block.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* Collapsed indicator — shows command text when collapsed */}
            {block.collapsed && block.command && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 8,
                  height: cellHeight,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--accent, #58a6ff)',
                  opacity: 0.8,
                  userSelect: 'none',
                  pointerEvents: 'none',
                  maxWidth: '60%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {block.command}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
