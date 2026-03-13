import { useCallback, useMemo, useState } from 'react'
import type { TerminalSession } from './TerminalTabs'

function collectRunningSessionIds(sessions: TerminalSession[]): string[] {
  const ids: string[] = []
  for (const session of sessions) {
    if (session.status === 'running') {
      ids.push(session.id)
    }
    if (session.splitSessionId && (session.splitStatus ?? 'running') === 'running') {
      ids.push(session.splitSessionId)
    }
  }
  return ids
}

export function useTerminalManagerState(
  sessions: TerminalSession[],
  activeSessionId: string | null,
): {
  activeSession: TerminalSession | null
  allSessionIds: string[]
  syncInput: boolean
  handleToggleSync: () => void
} {
  const [syncInput, setSyncInput] = useState(false)
  const handleToggleSync = useCallback(() => setSyncInput((prev) => !prev), [])
  const allSessionIds = useMemo(() => collectRunningSessionIds(sessions), [sessions])
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )

  return { activeSession, allSessionIds, syncInput, handleToggleSync }
}
