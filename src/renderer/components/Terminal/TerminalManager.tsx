/**
 * TerminalManager — renders terminal session content (no tab bar).
 *
 * Tab state is owned by App.tsx and rendered by TerminalPane.
 * This component only renders the terminal instances, exited overlays,
 * and the empty-state button.
 *
 * Split panes: when a session has a splitSessionId, two TerminalInstance
 * components are rendered side-by-side with a draggable divider.
 */

import React, { useState, useCallback, useRef, useMemo } from 'react'
import { TerminalInstance } from './TerminalInstance'
import type { TerminalSession } from './TerminalTabs'
import { EmptyState } from '../shared'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TerminalManagerProps {
  sessions: TerminalSession[]
  activeSessionId: string | null
  onRestart: (id: string) => void
  onClose: (id: string) => void
  onTitleChange: (id: string, title: string) => void
  onSpawn: () => void
  recordingSessions?: Set<string>
  onToggleRecording?: (sessionId: string) => void
  /** Called when user clicks "Split" in a TerminalInstance toolbar */
  onSplit?: (sessionId: string) => void
  /** Called when user closes the split pane (keeps primary, kills secondary) */
  onCloseSplit?: (sessionId: string) => void
}

// ─── Exited overlay ───────────────────────────────────────────────────────────

function ExitedOverlay({
  sessionId,
  onRestart,
  onClose,
}: {
  sessionId: string
  onRestart: (id: string) => void
  onClose: (id: string) => void
}): React.ReactElement {
  return (
    <div
      className="
        flex flex-col items-center justify-center w-full h-full gap-3
        text-[var(--text-muted)] font-mono text-sm
        bg-[var(--term-bg,var(--bg))]
      "
    >
      <span className="opacity-60">Process exited</span>
      <div className="flex gap-2">
        <button
          onClick={() => void onRestart(sessionId)}
          className="
            px-3 py-1 text-xs rounded
            bg-[var(--accent)] text-[var(--bg)]
            hover:bg-[var(--accent-hover)]
            transition-colors duration-100
          "
        >
          Restart
        </button>
        <button
          onClick={() => onClose(sessionId)}
          className="
            px-3 py-1 text-xs rounded
            border border-[var(--border)]
            text-[var(--text-muted)] hover:text-[var(--text)]
            hover:bg-[var(--bg-tertiary)]
            transition-colors duration-100
          "
        >
          Close tab
        </button>
      </div>
    </div>
  )
}

// ─── Split layout with draggable divider ──────────────────────────────────────

interface SplitPaneProps {
  session: TerminalSession
  isActive: boolean
  onTitleChange: (id: string, title: string) => void
  onRestart: (id: string) => void
  onClose: (id: string) => void
  onCloseSplit: (id: string) => void
  recordingSessions?: Set<string>
  onToggleRecording?: (sessionId: string) => void
  syncInput?: boolean
  allSessionIds?: string[]
  onToggleSync?: () => void
}

function SplitPaneLayout({
  session,
  isActive,
  onTitleChange,
  onRestart,
  onClose,
  onCloseSplit,
  recordingSessions,
  onToggleRecording,
  syncInput,
  allSessionIds,
  onToggleSync,
}: SplitPaneProps): React.ReactElement {
  const [splitRatio, setSplitRatio] = useState(0.5) // 0..1, left pane fraction
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true

    function onMouseMove(ev: MouseEvent): void {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }

    function onMouseUp(): void {
      isDraggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const splitId = session.splitSessionId!

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* Left (primary) pane */}
      <div style={{ width: `${splitRatio * 100}%`, height: '100%', position: 'relative', overflow: 'hidden' }}>
        {session.status === 'running' ? (
          <TerminalInstance
            sessionId={session.id}
            isActive={isActive}
            onTitleChange={onTitleChange}
            isRecording={recordingSessions?.has(session.id) ?? false}
            onToggleRecording={onToggleRecording}
            syncInput={syncInput}
            allSessionIds={allSessionIds}
            onToggleSync={onToggleSync}
          />
        ) : (
          <ExitedOverlay sessionId={session.id} onRestart={onRestart} onClose={onClose} />
        )}
      </div>

      {/* Draggable divider */}
      <div
        style={{
          width: 5,
          flexShrink: 0,
          cursor: 'col-resize',
          backgroundColor: 'var(--border, #333)',
          position: 'relative',
          zIndex: 5,
        }}
        onMouseDown={handleDividerMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize split pane"
      />

      {/* Right (split) pane */}
      <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        {/* Close split button */}
        <button
          onClick={() => onCloseSplit(session.id)}
          title="Close split pane"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 20,
            padding: '2px 6px',
            borderRadius: 3,
            border: '1px solid var(--border, #333)',
            backgroundColor: 'var(--bg-secondary, #1e1e1e)',
            color: 'var(--text-muted, #888)',
            fontFamily: 'var(--font-ui, sans-serif)',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          Close split
        </button>

        {(session.splitStatus ?? 'running') === 'running' ? (
          <TerminalInstance
            sessionId={splitId}
            isActive={isActive}
            onTitleChange={onTitleChange}
            isRecording={recordingSessions?.has(splitId) ?? false}
            onToggleRecording={onToggleRecording}
            syncInput={syncInput}
            allSessionIds={allSessionIds}
            onToggleSync={onToggleSync}
          />
        ) : (
          <ExitedOverlay sessionId={splitId} onRestart={onRestart} onClose={() => onCloseSplit(session.id)} />
        )}
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TerminalManager({
  sessions,
  activeSessionId,
  onRestart,
  onClose,
  onTitleChange,
  onSpawn,
  recordingSessions,
  onToggleRecording,
  onSplit,
  onCloseSplit,
}: TerminalManagerProps): React.ReactElement {
  const [syncInput, setSyncInput] = useState(false)

  const handleToggleSync = useCallback(() => {
    setSyncInput((prev) => !prev)
  }, [])

  // Collect all running session IDs (primary + split) for mirroring
  const allSessionIds = useMemo(() => {
    const ids: string[] = []
    for (const s of sessions) {
      if (s.status === 'running') ids.push(s.id)
      if (s.splitSessionId && (s.splitStatus ?? 'running') === 'running') ids.push(s.splitSessionId)
    }
    return ids
  }, [sessions])

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ backgroundColor: 'var(--term-bg, var(--bg))' }}
    >
      {/* Terminal instances — only active terminal is mounted (lazy-mount).
           PTY sessions stay alive in main process; xterm restores from PTY history on switch. */}
      <div className="flex-1 min-h-0 relative">
        {sessions.map((session) => {
          const isActiveSession = session.id === activeSessionId
          // Lazy-mount: only render the active terminal's React component.
          // Inactive terminals are unmounted to save memory; the PTY session
          // remains alive in the main process.
          if (!isActiveSession) return null
          return (
            <div
              key={session.id}
              className="absolute inset-0"
            >
              {session.splitSessionId ? (
                // ── Split pane layout ─────────────────────────────────────
                <SplitPaneLayout
                  session={session}
                  isActive={isActiveSession}
                  onTitleChange={onTitleChange}
                  onRestart={onRestart}
                  onClose={onClose}
                  onCloseSplit={onCloseSplit ?? (() => {})}
                  recordingSessions={recordingSessions}
                  onToggleRecording={onToggleRecording}
                  syncInput={syncInput}
                  allSessionIds={allSessionIds}
                  onToggleSync={handleToggleSync}
                />
              ) : session.status === 'running' ? (
                // ── Single pane ───────────────────────────────────────────
                <TerminalInstance
                  sessionId={session.id}
                  isActive={isActiveSession}
                  onTitleChange={onTitleChange}
                  isRecording={recordingSessions?.has(session.id) ?? false}
                  onToggleRecording={onToggleRecording}
                  onSplit={onSplit}
                  syncInput={syncInput}
                  allSessionIds={allSessionIds}
                  onToggleSync={handleToggleSync}
                />
              ) : (
                // ── Exited overlay ────────────────────────────────────────
                <ExitedOverlay sessionId={session.id} onRestart={onRestart} onClose={onClose} />
              )}
            </div>
          )
        })}

        {/* Empty state */}
        {sessions.length === 0 && (
          <EmptyState
            icon="terminal"
            title="No terminals open"
            description="Open a terminal to run commands in your project."
            action={{ label: 'New Terminal', onClick: onSpawn }}
          />
        )}
      </div>
    </div>
  )
}
