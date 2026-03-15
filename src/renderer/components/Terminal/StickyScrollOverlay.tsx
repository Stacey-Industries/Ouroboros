/**
 * StickyScrollOverlay — pinned command header at the top of the terminal
 * viewport when scrolling through a command's output.
 *
 * Shows: command text, exit code indicator, duration, click-to-scroll-back.
 * Hides when the viewport naturally shows the command's prompt row.
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { CommandBlock } from './useCommandBlocks'

export interface StickyScrollOverlayProps {
  blocks: CommandBlock[]
  terminal: Terminal | null
}

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

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function truncateCommand(cmd: string, max: number = 50): string {
  if (cmd.length <= max) return cmd
  return cmd.slice(0, max - 1) + '\u2026'
}

/**
 * Find the command whose prompt row is above viewport top and whose output
 * extends into the viewport (i.e., the command the user is scrolling through).
 */
function findStickyCommand(blocks: CommandBlock[], viewportTop: number): CommandBlock | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    // Prompt is above viewport, and the block extends into the viewport
    if (block.startLine < viewportTop && block.endLine >= viewportTop) {
      return block
    }
  }
  return null
}

// ── Styles ───────────────────────────────────────────────────────────────────

const stickyContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '2px 8px 2px 6px',
  background: 'var(--bg-secondary, rgba(30,30,30,0.95))',
  backdropFilter: 'blur(4px)',
  borderBottom: '1px solid var(--border, #333)',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  color: 'var(--text, #ccc)',
  cursor: 'pointer',
  userSelect: 'none',
  pointerEvents: 'auto',
  transition: 'opacity 0.15s ease',
}

function ExitDot({ exitCode }: { exitCode?: number }): React.ReactElement {
  const isRunning = exitCode === undefined
  const isSuccess = exitCode === 0
  const color = isRunning
    ? 'var(--accent, #58a6ff)'
    : isSuccess
      ? 'var(--success, #4caf50)'
      : 'var(--error, #e53935)'

  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, flexShrink: 0,
      animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined,
    }} />
  )
}

// Inject pulse keyframe once
let pulseInjected = false
function ensurePulseKeyframe(): void {
  if (pulseInjected) return
  pulseInjected = true
  const style = document.createElement('style')
  style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }'
  document.head.appendChild(style)
}

// ── Live Duration ────────────────────────────────────────────────────────────

function LiveDuration({ block }: { block: CommandBlock }): React.ReactElement | null {
  const [elapsed, setElapsed] = useState(() =>
    block.complete
      ? block.duration
      : Date.now() - block.timestamp,
  )

  useEffect(() => {
    if (block.complete) {
      setElapsed(block.duration)
      return
    }
    const id = setInterval(() => setElapsed(Date.now() - block.timestamp), 200)
    return () => clearInterval(id)
  }, [block.complete, block.duration, block.timestamp])

  if (elapsed === undefined || elapsed < 500) return null
  return (
    <span style={{
      fontSize: 10, color: 'var(--text-muted, #888)',
      marginLeft: 'auto', flexShrink: 0,
    }}>
      {formatDuration(elapsed)}
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function StickyScrollOverlay({ blocks, terminal }: StickyScrollOverlayProps): React.ReactElement | null {
  ensurePulseKeyframe()

  const [viewportY, setViewportY] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!terminal) return
    setViewportY(terminal.buffer.active.viewportY)

    const scrollD = terminal.onScroll(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setViewportY(terminal.buffer.active.viewportY)
      })
    })

    const writeD = terminal.onWriteParsed(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setViewportY(terminal.buffer.active.viewportY)
      })
    })

    return () => {
      scrollD.dispose()
      writeD.dispose()
      cancelAnimationFrame(rafRef.current)
    }
  }, [terminal])

  const stickyBlock = useMemo(
    () => findStickyCommand(blocks, viewportY),
    [blocks, viewportY],
  )

  const handleClick = useCallback(() => {
    if (!terminal || !stickyBlock) return
    const targetRow = Math.max(0, stickyBlock.startLine - 1)
    terminal.scrollToLine(targetRow)
  }, [terminal, stickyBlock])

  if (!stickyBlock || !terminal) return null

  const cellHeight = getCellHeight(terminal)

  return (
    <div
      style={{ ...stickyContainerStyle, height: cellHeight }}
      onClick={handleClick}
      title="Click to scroll to command"
    >
      <ExitDot exitCode={stickyBlock.complete ? (stickyBlock.exitCode ?? 0) : undefined} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {stickyBlock.command ? truncateCommand(stickyBlock.command) : '(command)'}
      </span>
      {stickyBlock.exitCode !== undefined && stickyBlock.exitCode !== 0 && (
        <span style={{
          fontSize: 10, padding: '0 3px', borderRadius: 2,
          background: 'rgba(229,57,53,0.1)', color: 'var(--error, #e53935)',
        }}>
          exit {stickyBlock.exitCode}
        </span>
      )}
      <LiveDuration block={stickyBlock} />
      <span style={{ fontSize: 9, color: 'var(--text-muted, #666)', flexShrink: 0 }}>
        {'\u2191'} scroll to prompt
      </span>
    </div>
  )
}
