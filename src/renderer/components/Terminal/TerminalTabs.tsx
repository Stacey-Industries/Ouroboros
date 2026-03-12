/**
 * TerminalTabs — tab bar for managing multiple terminal sessions.
 *
 * Features:
 * - Active tab highlighted with accent underline
 * - Close button visible on hover or when tab is active
 * - Middle-click to close
 * - Drag-to-reorder (simple swap implementation)
 * - New tab (+) button at the end of the tab list
 */

import React, { useState, useRef, useCallback } from 'react'
import { Tooltip } from '../shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalSession {
  id: string
  title: string
  status: 'running' | 'exited'
  /** True if this terminal auto-launched Claude Code */
  isClaude?: boolean
  /** When set, this tab shows a split-pane layout with a second PTY session */
  splitSessionId?: string
  splitStatus?: 'running' | 'exited'
}

export interface TerminalTabsProps {
  sessions: TerminalSession[]
  activeSessionId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onNewClaude: () => void
  /** Called when the user reorders tabs. Receives new ordered session list. */
  onReorder?: (reordered: TerminalSession[]) => void
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M1 1L7 7M7 1L1 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlusIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 1V9M1 5H9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
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
  session,
  isActive,
  isDragging,
  isDragOver,
  onActivate,
  onClose,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: TabItemProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const isExited = session.status === 'exited'

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      // Middle-click
      e.preventDefault()
      onClose()
    }
  }

  const label = isExited ? `${session.title} [exited]` : session.title

  return (
    <div
      draggable
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      title={label}
      className={[
        'relative flex items-center gap-1.5 px-3 h-full cursor-pointer select-none',
        'text-xs font-mono border-r border-[var(--border)] shrink-0',
        'transition-colors duration-100',
        isDragOver && !isDragging
          ? 'bg-[var(--bg-tertiary)] border-l-2 border-l-[var(--accent)]'
          : '',
        isDragging ? 'opacity-40' : '',
        isActive
          ? 'bg-[var(--bg)] text-[var(--text)] after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-[var(--accent)]'
          : isExited
          ? 'text-[var(--text-muted)] opacity-60 hover:opacity-80 hover:bg-[var(--bg-tertiary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)]',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onActivate}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => e.key === 'Enter' && onActivate()}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Claude session indicator */}
      {session.isClaude && (
        <span
          className="flex-shrink-0 text-[var(--accent)]"
          style={{ fontSize: '10px', lineHeight: 1 }}
          title="Claude Code session"
        >
          ◆
        </span>
      )}

      {/* Exited dot indicator */}
      {isExited && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] flex-shrink-0"
          aria-label="exited"
        />
      )}

      <span className="truncate max-w-[120px]">{label}</span>

      {/* Close button */}
      {(hovered || isActive) && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          onMouseDown={(e) => e.stopPropagation()} // prevent tab activate on close click
          className="
            flex-shrink-0 p-0.5 rounded
            text-[var(--text-muted)] hover:text-[var(--text)]
            hover:bg-[var(--bg-secondary)]
            transition-colors duration-100
          "
          title={`Close ${session.title}`}
          aria-label={`Close ${session.title}`}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

export function TerminalTabs({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onNew,
  onNewClaude,
  onReorder,
}: TerminalTabsProps): React.ReactElement {
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleDragStart = useCallback((id: string) => {
    draggingIdRef.current = id
    setDraggingId(id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggingIdRef.current !== id) {
      setDragOverId(id)
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverId(null)
  }, [])

  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = draggingIdRef.current
      if (!sourceId || sourceId === targetId || !onReorder) {
        setDragOverId(null)
        return
      }
      const reordered = [...sessions]
      const fromIdx = reordered.findIndex((s) => s.id === sourceId)
      const toIdx = reordered.findIndex((s) => s.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return
      const [item] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, item)
      onReorder(reordered)
      setDragOverId(null)
    },
    [sessions, onReorder]
  )

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null
    setDraggingId(null)
    setDragOverId(null)
  }, [])

  return (
    <div
      className="flex items-stretch h-full overflow-x-auto overflow-y-hidden"
      role="tablist"
      aria-label="Terminal sessions"
    >
      {sessions.map((session) => (
        <TabItem
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          isDragging={draggingId === session.id}
          isDragOver={dragOverId === session.id}
          onActivate={() => onActivate(session.id)}
          onClose={() => onClose(session.id)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            handleDragStart(session.id)
          }}
          onDragOver={(e) => handleDragOver(e, session.id)}
          onDragLeave={handleDragLeave}
          onDrop={() => handleDrop(session.id)}
          onDragEnd={handleDragEnd}
        />
      ))}

      {/* New tab */}
      <Tooltip text="New terminal (Ctrl+Shift+`)" position="bottom">
        <button
          onClick={onNew}
          aria-label="New terminal tab"
          className="
            flex-shrink-0 flex items-center justify-center w-7 h-full
            text-[var(--text-muted)] hover:text-[var(--text)]
            hover:bg-[var(--bg-tertiary)]
            transition-colors duration-100
            border-r border-[var(--border)]
          "
        >
          <PlusIcon />
        </button>
      </Tooltip>

      {/* New Claude terminal */}
      <Tooltip text="New Claude terminal (Ctrl+Shift+C)" position="bottom">
        <button
          onClick={onNewClaude}
          aria-label="New Claude Code terminal"
          className="
            flex-shrink-0 flex items-center justify-center gap-1 px-2 h-full
            text-[var(--accent)] hover:text-[var(--text)]
            hover:bg-[var(--bg-tertiary)]
            transition-colors duration-100
            border-r border-[var(--border)]
            text-[10px] font-medium
          "
        >
          <span style={{ fontSize: '10px' }}>◆</span>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-ui)' }}>Claude</span>
        </button>
      </Tooltip>
    </div>
  )
}
