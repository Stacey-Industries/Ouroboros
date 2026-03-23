/**
 * CommandBlockOverlayBody - visual command separators, gutter icons, labels,
 * timestamps, action bars, and collapse overlays.
 */

import type { Terminal } from '@xterm/xterm'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { EXPLAIN_TERMINAL_ERROR_EVENT, OPEN_AGENT_CHAT_PANEL_EVENT } from '../../hooks/appEventNames'
import { CommandBlockActions } from './CommandBlockActions'
import type { CommandBlock } from './useCommandBlocks'

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
function getCellHeight(term: Terminal): number {
  try {
    const core = (term as unknown as Record<string, unknown>)._core as Record<string, unknown> | undefined
    const renderService = core?._renderService as Record<string, unknown> | undefined
    const dimensions = renderService?.dimensions as { css?: { cell?: { height?: number } } } | undefined
    if (dimensions?.css?.cell?.height) return dimensions.css.cell.height
    } catch { /* ignore */ }
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
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function truncateCommand(cmd: string, max: number = 60): string {
  return cmd.length <= max ? cmd : `${cmd.slice(0, max - 1)}\u2026`
}

const overlayContainerStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }
const separatorLineStyle: React.CSSProperties = { position: 'absolute', left: 28, right: 0, height: 1, opacity: 0.5 }
const gutterStyle: React.CSSProperties = { position: 'absolute', left: 4, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 7 }
const commandLabelStyle: React.CSSProperties = { position: 'absolute', left: 32, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: 'var(--font-mono, monospace)', opacity: 0.85, userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }
const timestampStyle: React.CSSProperties = { position: 'absolute', right: 6, fontSize: 9, fontFamily: 'var(--font-mono, monospace)', opacity: 0.7, userSelect: 'none' }
const actionsContainerStyle: React.CSSProperties = { position: 'absolute', right: 80, display: 'flex', alignItems: 'center', opacity: 0, transition: 'opacity 0.15s ease' }
const collapsedOverlayStyle: React.CSSProperties = { position: 'absolute', left: 28, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer', pointerEvents: 'auto', userSelect: 'none' }
function GutterIcon({ block }: { block: CommandBlock }): React.ReactElement {
  if (!block.complete) {
    return <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: 'agent-ide-spin 1s linear infinite' }}><circle cx="8" cy="8" r="6" fill="none" stroke="var(--accent, #58a6ff)" strokeWidth="2" strokeDasharray="20 18" strokeLinecap="round" /></svg>
  }
  if (block.exitCode === 0 || block.exitCode === undefined) {
    return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="var(--success, #4caf50)" strokeWidth="1.5" opacity="0.8" /><path d="M5 8l2 2 4-4" stroke="var(--success, #4caf50)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  }
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="var(--error, #e53935)" strokeWidth="1.5" opacity="0.8" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--error, #e53935)" strokeWidth="1.5" strokeLinecap="round" /></svg>
}

const OutputBorder = ({ color, active }: { color: string; active: boolean }): React.ReactElement => (
  <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: color, opacity: active ? 0.9 : 0.4, transition: 'opacity 0.15s ease' }} />
)
const CommandLabel = ({ command, cellHeight }: { command: string; cellHeight: number }): React.ReactElement => (
  <div className="text-interactive-accent" style={{ ...commandLabelStyle, top: (cellHeight - 14) / 2, height: 14 }} title={command}>{truncateCommand(command)}</div>
)

const TimestampRow = ({ timestamp, duration, cellHeight }: { timestamp: number; duration?: number; cellHeight: number }): React.ReactElement => (
  <div className="text-text-semantic-muted" style={{ ...timestampStyle, top: (cellHeight - 12) / 2, height: 12, lineHeight: '12px' }}>
    <RelativeTimestamp timestamp={timestamp} />
    {duration !== undefined && duration > 500 && <span style={{ marginLeft: 6, color: duration > 10000 ? 'var(--warning, #f0a030)' : undefined }}>{formatDuration(duration)}</span>}
  </div>
)

const ActionBar = ({
  hovered,
  cellHeight,
  block,
  sessionId,
  onToggleCollapse,
  onCopyOutput,
  onCopyCommand,
  onExplainError,
}: {
  hovered: boolean
  cellHeight: number
  block: CommandBlock
  sessionId: string
  onToggleCollapse: (blockId: string) => void
  onCopyOutput: (block: CommandBlock) => void
  onCopyCommand: (block: CommandBlock) => void
  onExplainError: (block: CommandBlock) => void
}): React.ReactElement => (
  <div style={{ ...actionsContainerStyle, top: (cellHeight - 18) / 2, opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none' }}>
    <CommandBlockActions block={block} sessionId={sessionId} onCopyOutput={onCopyOutput} onCopyCommand={onCopyCommand} onToggleCollapse={onToggleCollapse} onExplainError={onExplainError} />
  </div>
)

const CollapsedOverlay = ({
  block,
  cellHeight,
  borderColor,
  collapsedLines,
  onToggleCollapse,
}: {
  block: CommandBlock
  cellHeight: number
  borderColor: string
  collapsedLines: number
  onToggleCollapse: (blockId: string) => void
}): React.ReactElement => (
  <div className="bg-surface-panel text-text-semantic-muted border-l-2" style={{ ...collapsedOverlayStyle, top: cellHeight, height: '100%', borderLeftColor: borderColor }} onClick={() => onToggleCollapse(block.id)} title="Click to expand">
    {collapsedLines} line{collapsedLines !== 1 ? 's' : ''} collapsed - click to expand
  </div>
)

interface CommandBlockDecorationViewProps {
  block: CommandBlock
  cellHeight: number
  separatorY: number
  outputHeight: number
  borderColor: string
  isActive: boolean
  hovered: boolean
  setHovered: React.Dispatch<React.SetStateAction<boolean>>
  onToggleCollapse: (blockId: string) => void
  onCopyOutput: (block: CommandBlock) => void
  onCopyCommand: (block: CommandBlock) => void
  onExplainError: (block: CommandBlock) => void
  sessionId: string
}

function CommandBlockDecorationView({
  block,
  cellHeight,
  separatorY,
  outputHeight,
  borderColor,
  isActive,
  hovered,
  setHovered,
  onToggleCollapse,
  onCopyOutput,
  onCopyCommand,
  onExplainError,
  sessionId,
}: CommandBlockDecorationViewProps): React.ReactElement {
  const collapsedLines = block.collapsed ? block.endLine - block.outputStartLine : 0

  return (
    <div style={{ position: 'absolute', top: separatorY, left: 0, right: 0, height: outputHeight, pointerEvents: 'none' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="bg-border-semantic" style={{ ...separatorLineStyle, top: 0 }} />
      <OutputBorder color={borderColor} active={isActive} />
      <div style={{ ...gutterStyle, top: (cellHeight - 20) / 2 }}><GutterIcon block={block} /></div>
      {block.command && <CommandLabel command={block.command} cellHeight={cellHeight} />}
      <TimestampRow timestamp={block.timestamp} duration={block.duration} cellHeight={cellHeight} />
      <ActionBar hovered={hovered} cellHeight={cellHeight} block={block} sessionId={sessionId} onToggleCollapse={onToggleCollapse} onCopyOutput={onCopyOutput} onCopyCommand={onCopyCommand} onExplainError={onExplainError} />
      {block.collapsed && collapsedLines > 0 && <CollapsedOverlay block={block} cellHeight={cellHeight} borderColor={borderColor} collapsedLines={collapsedLines} onToggleCollapse={onToggleCollapse} />}
    </div>
  )
}

interface CommandBlockDecorationProps {
  block: CommandBlock
  index: number
  cellHeight: number
  viewportY: number
  activeBlockIndex: number
  onToggleCollapse: (blockId: string) => void
  onCopyOutput: (block: CommandBlock) => void
  onCopyCommand: (block: CommandBlock) => void
  onExplainError: (block: CommandBlock) => void
  sessionId: string
}

function CommandBlockDecoration({
  block,
  index,
  cellHeight,
  viewportY,
  activeBlockIndex,
  onToggleCollapse,
  onCopyOutput,
  onCopyCommand,
  onExplainError,
  sessionId,
}: CommandBlockDecorationProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const isActive = index === activeBlockIndex
  const separatorY = (block.startLine - viewportY) * cellHeight
  const outputHeight = block.collapsed ? cellHeight : (block.endLine - block.startLine + 1) * cellHeight
  const borderColor = block.exitCode !== undefined && block.exitCode !== 0 ? 'var(--error, #e53935)' : !block.complete ? 'var(--accent, #58a6ff)' : 'var(--success, #4caf50)'

  return (
    <CommandBlockDecorationView
      block={block}
      cellHeight={cellHeight}
      separatorY={separatorY}
      outputHeight={outputHeight}
      borderColor={borderColor}
      isActive={isActive}
      hovered={hovered}
      setHovered={setHovered}
      onToggleCollapse={onToggleCollapse}
      onCopyOutput={onCopyOutput}
      onCopyCommand={onCopyCommand}
      onExplainError={onExplainError}
      sessionId={sessionId}
    />
  )
}

function RelativeTimestamp({ timestamp }: { timestamp: number }): React.ReactElement {
  const [text, setText] = useState(() => formatRelativeTime(timestamp))
  useEffect(() => {
    const id = setInterval(() => setText(formatRelativeTime(timestamp)), 5000)
    return () => clearInterval(id)
  }, [timestamp])
  return <span>{text}</span>
}

function useVisibleBlocks(blocks: CommandBlock[], terminal: Terminal | null): VisibleBlock[] {
  return useMemo(() => {
    if (!terminal || blocks.length === 0) return []
    const viewportTop = terminal.buffer.active.viewportY
    const viewportBottom = viewportTop + terminal.rows
    return blocks.map((block, index) => ({ block, index })).filter(({ block }) => block.endLine >= viewportTop && block.startLine <= viewportBottom)
  }, [blocks, terminal])
}

function useScrollViewportY(terminal: Terminal | null): number {
  const [viewportY, setViewportY] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!terminal || !terminal.element) return
    const core = (terminal as unknown as { _core?: { _isDisposed?: boolean } })._core
    if (core?._isDisposed) return

    let scrollDisposable: { dispose(): void } | null = null
    let writeDisposable: { dispose(): void } | null = null
    try {
      setViewportY(terminal.buffer.active.viewportY)
      scrollDisposable = terminal.onScroll(() => {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => setViewportY(terminal.buffer.active.viewportY))
      })
      writeDisposable = terminal.onWriteParsed(() => {
        const buf = terminal.buffer.active
        if (buf.viewportY >= buf.baseY) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = requestAnimationFrame(() => setViewportY(terminal.buffer.active.viewportY))
        }
      })
    } catch { /* ignore */ }
    return () => {
      scrollDisposable?.dispose()
      writeDisposable?.dispose()
      cancelAnimationFrame(rafRef.current)
    }
  }, [terminal])

  return viewportY
}
function readTerminalLines(term: Terminal, startLine: number, endLine: number, maxLines: number = 50): string {
  const buf = term.buffer.active
  const from = Math.max(startLine, endLine - maxLines + 1)
  const lines: string[] = []
  for (let i = from; i <= endLine; i++) {
    const line = buf.getLine(i)
    if (line) lines.push(line.translateToString(true))
  }
  return lines.join('\n').trimEnd()
}

export function CommandBlockOverlayBody({
  activeBlockIndex,
  blocks,
  onCopyOutput,
  onCopyCommand,
  onToggleCollapse,
  terminal,
  sessionId,
}: CommandBlockOverlayProps): React.ReactElement | null {
  const visibleBlocks = useVisibleBlocks(blocks, terminal)
  const viewportY = useScrollViewportY(terminal)
  const handleExplainError = useExplainErrorHandler(terminal)

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
          onExplainError={handleExplainError}
          sessionId={sessionId}
        />
      ))}
    </div>
  )
}

function useExplainErrorHandler(terminal: Terminal | null): (block: CommandBlock) => void {
  return useCallback((block: CommandBlock) => {
    if (!terminal) return
    const output = readTerminalLines(terminal, block.outputStartLine, block.endLine)
    const cmd = block.command || '(unknown command)'
    const prompt = `Explain this terminal error:\n\`\`\`\n$ ${cmd}\n${output}\n\`\`\`\nExit code: ${block.exitCode}`
    window.dispatchEvent(new CustomEvent(OPEN_AGENT_CHAT_PANEL_EVENT))
    window.dispatchEvent(new CustomEvent(EXPLAIN_TERMINAL_ERROR_EVENT, { detail: { prompt } }))
  }, [terminal])
}
