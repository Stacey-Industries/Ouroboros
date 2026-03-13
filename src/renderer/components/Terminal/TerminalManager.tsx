import React from 'react'
import type { TerminalSession } from './TerminalTabs'
import { EmptyState } from '../shared'
import { ActiveTerminalContent } from './TerminalManagerContent'
import { useTerminalManagerState } from './TerminalManagerState'

export interface TerminalManagerProps {
  sessions: TerminalSession[]
  activeSessionId: string | null
  onRestart: (id: string) => void
  onClose: (id: string) => void
  onTitleChange: (id: string, title: string) => void
  onSpawn: () => void
  recordingSessions?: Set<string>
  onToggleRecording?: (sessionId: string) => void
  onSplit?: (sessionId: string) => void
  onCloseSplit?: (sessionId: string) => void
}

const NOOP = (): void => {}

function TerminalManagerShell({
  activeContent,
  isEmpty,
  onSpawn,
}: {
  activeContent: React.ReactNode
  isEmpty: boolean
  onSpawn: () => void
}): React.ReactElement {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--term-bg, var(--bg))' }}
    >
      <div className="relative flex-1 min-h-0">
        {activeContent}
        {isEmpty && (
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
  const { activeSession, allSessionIds, syncInput, handleToggleSync } =
    useTerminalManagerState(sessions, activeSessionId)
  const activeContent = activeSession ? (
    <div className="absolute inset-0">
      <ActiveTerminalContent
        session={activeSession}
        isActive
        onTitleChange={onTitleChange}
        onRestart={onRestart}
        onClose={onClose}
        onSplit={onSplit}
        onCloseSplit={onCloseSplit ?? NOOP}
        recordingSessions={recordingSessions}
        onToggleRecording={onToggleRecording}
        syncInput={syncInput}
        allSessionIds={allSessionIds}
        onToggleSync={handleToggleSync}
      />
    </div>
  ) : null

  return (
    <TerminalManagerShell
      activeContent={activeContent}
      isEmpty={sessions.length === 0}
      onSpawn={onSpawn}
    />
  )
}
