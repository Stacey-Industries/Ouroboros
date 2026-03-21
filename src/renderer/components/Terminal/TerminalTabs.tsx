/**
 * TerminalTabs — tab bar for managing multiple terminal sessions.
 */

import React, { useState, useRef, useCallback } from 'react'
import { ClaudeModelMenu, shortModelName } from './ClaudeModelMenu'
import { CodexModelMenu } from './CodexModelMenu'
import { Tooltip } from '../shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalSession {
  id: string
  title: string
  status: 'running' | 'exited'
  isClaude?: boolean
  isCodex?: boolean
  claudeSessionId?: string
  codexThreadId?: string
  splitSessionId?: string
  splitStatus?: 'running' | 'exited'
  /** Provider:model override used when spawning (for tab tooltip display) */
  model?: string
}

export interface TerminalTabsProps {
  sessions: TerminalSession[]
  activeSessionId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onNewClaude: (providerModel?: string) => void
  onNewCodex: (model?: string) => void
  onReorder?: (reordered: TerminalSession[]) => void
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon(): React.ReactElement {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 1V9M1 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Tab class builder ────────────────────────────────────────────────────────

function getTabClasses(isActive: boolean, isExited: boolean, isDragging: boolean, isDragOver: boolean): string {
  const base = 'relative flex items-center gap-1.5 px-3 h-full cursor-pointer select-none text-xs font-mono border-r border-[var(--border)] shrink-0 transition-all duration-150'
  const dragOver = isDragOver && !isDragging ? 'bg-[var(--bg-tertiary)] border-l-2 border-l-[var(--accent)]' : ''
  const dragging = isDragging ? 'opacity-40' : ''
  const state = isActive
    ? 'bg-[var(--term-bg,var(--bg))] text-[var(--text)] after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-[var(--accent)]'
    : isExited
      ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] opacity-60 hover:opacity-80 hover:bg-[var(--bg-tertiary)]'
      : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)]'
  return [base, dragOver, dragging, state].filter(Boolean).join(' ')
}

// ─── Single tab ───────────────────────────────────────────────────────────────

interface TabItemProps {
  session: TerminalSession
  isActive: boolean
  isDragging: boolean
  isDragOver: boolean
  onActivate: () => void
  onClose: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function TabItem({
  session, isActive, isDragging, isDragOver,
  onActivate, onClose,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: TabItemProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const isExited = session.status === 'exited'
  const modelSuffix = session.model ? ` (${shortModelName(session.model)})` : ''
  const label = isExited ? `${session.title} [exited]${modelSuffix}` : `${session.title}${modelSuffix}`

  return (
    <div
      draggable role="tab" aria-selected={isActive} tabIndex={0} title={label}
      className={getTabClasses(isActive, isExited, isDragging, isDragOver)}
      onClick={onActivate}
      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose() } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => e.key === 'Enter' && onActivate()}
      onDragStart={onDragStart} onDragOver={onDragOver}
      onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={onDragEnd}
    >
      {session.isClaude && <span className="flex-shrink-0 text-[var(--accent)]" style={{ fontSize: '10px', lineHeight: 1 }} title="Claude Code session">&#9670;</span>}
      {session.isCodex && <span className="flex-shrink-0 text-[var(--accent-blue,var(--accent))]" style={{ fontSize: '10px', lineHeight: 1 }} title="Codex session">&#9671;</span>}
      {isExited && <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] flex-shrink-0" aria-label="exited" />}
      <span className="truncate max-w-[120px]">{label}</span>
      {(hovered || isActive) && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors duration-100"
          title={`Close ${session.title}`} aria-label={`Close ${session.title}`}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}

// ─── Drag-and-drop hook ──────────────────────────────────────────────────────

function useTabDragDrop(sessions: TerminalSession[], onReorder?: (reordered: TerminalSession[]) => void) {
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleDragStart = useCallback((id: string) => {
    draggingIdRef.current = id; setDraggingId(id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggingIdRef.current !== id) setDragOverId(id)
  }, [])

  const handleDrop = useCallback((targetId: string) => {
    const sourceId = draggingIdRef.current
    if (!sourceId || sourceId === targetId || !onReorder) { setDragOverId(null); return }
    const reordered = [...sessions]
    const fromIdx = reordered.findIndex((s) => s.id === sourceId)
    const toIdx = reordered.findIndex((s) => s.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [item] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, item)
    onReorder(reordered)
    setDragOverId(null)
  }, [sessions, onReorder])

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null; setDraggingId(null); setDragOverId(null)
  }, [])

  const handleDragLeave = useCallback(() => setDragOverId(null), [])

  return { draggingId, dragOverId, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd }
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

export function TerminalTabs({
  sessions, activeSessionId, onActivate, onClose, onNew, onNewClaude, onNewCodex, onReorder,
}: TerminalTabsProps): React.ReactElement {
  const dnd = useTabDragDrop(sessions, onReorder)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showCodexModelMenu, setShowCodexModelMenu] = useState(false)
  const claudeBtnRef = useRef<HTMLButtonElement>(null)
  const codexBtnRef = useRef<HTMLButtonElement>(null)

  const handleClaudeClick = useCallback(() => {
    onNewClaude()
  }, [onNewClaude])

  const handleClaudeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setShowModelMenu((prev) => !prev)
  }, [])

  const handleModelSelect = useCallback((model: string) => {
    onNewClaude(model)
  }, [onNewClaude])

  const handleMenuClose = useCallback(() => {
    setShowModelMenu(false)
  }, [])

  const handleCodexClick = useCallback(() => {
    onNewCodex()
  }, [onNewCodex])

  const handleCodexContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setShowCodexModelMenu((prev) => !prev)
  }, [])

  const handleCodexModelSelect = useCallback((model: string) => {
    onNewCodex(model)
  }, [onNewCodex])

  const handleCodexMenuClose = useCallback(() => {
    setShowCodexModelMenu(false)
  }, [])

  return (
    <div className="flex items-stretch h-full overflow-x-auto overflow-y-hidden" role="tablist" aria-label="Terminal sessions">
      {sessions.map((session) => (
        <TabItem
          key={session.id} session={session}
          isActive={session.id === activeSessionId}
          isDragging={dnd.draggingId === session.id}
          isDragOver={dnd.dragOverId === session.id}
          onActivate={() => onActivate(session.id)}
          onClose={() => onClose(session.id)}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dnd.handleDragStart(session.id) }}
          onDragOver={(e) => dnd.handleDragOver(e, session.id)}
          onDragLeave={dnd.handleDragLeave}
          onDrop={() => dnd.handleDrop(session.id)}
          onDragEnd={dnd.handleDragEnd}
        />
      ))}
      <Tooltip text="New terminal (Ctrl+Shift+`)" position="bottom">
        <button onClick={onNew} aria-label="New terminal tab" className="flex-shrink-0 flex items-center justify-center w-7 h-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)] transition-all duration-150 border-r border-[var(--border)] rounded-sm"><PlusIcon /></button>
      </Tooltip>
      <div className="relative flex items-stretch">
        <Tooltip text="New Claude terminal (click) / Select model (right-click)" position="bottom">
          <button
            ref={claudeBtnRef}
            onClick={handleClaudeClick}
            onContextMenu={handleClaudeContextMenu}
            aria-label="New Claude Code terminal"
            aria-haspopup="true"
            aria-expanded={showModelMenu}
            className="flex-shrink-0 flex items-center justify-center gap-1 px-2 h-full text-[var(--accent)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)] transition-all duration-150 border-r border-[var(--border)] text-[10px] font-medium rounded-sm"
          >
            <span style={{ fontSize: '10px' }}>&#9670;</span>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-ui)' }}>Claude</span>
          </button>
        </Tooltip>
        {showModelMenu && (
          <ClaudeModelMenu
            anchorRef={claudeBtnRef}
            onSelect={handleModelSelect}
            onClose={handleMenuClose}
          />
        )}
      </div>
      <div className="relative flex items-stretch">
        <Tooltip text="New Codex terminal (click) / Select model (right-click)" position="bottom">
          <button
            ref={codexBtnRef}
            onClick={handleCodexClick}
            onContextMenu={handleCodexContextMenu}
            aria-label="New Codex terminal"
            aria-haspopup="true"
            aria-expanded={showCodexModelMenu}
            className="flex-shrink-0 flex items-center justify-center gap-1 px-2 h-full text-[var(--accent-blue,var(--accent))] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)] transition-all duration-150 border-r border-[var(--border)] text-[10px] font-medium rounded-sm"
          >
            <span style={{ fontSize: '10px' }}>&#9671;</span>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-ui)' }}>Codex</span>
          </button>
        </Tooltip>
        {showCodexModelMenu && (
          <CodexModelMenu
            anchorRef={codexBtnRef}
            onSelect={handleCodexModelSelect}
            onClose={handleCodexMenuClose}
          />
        )}
      </div>
    </div>
  )
}
