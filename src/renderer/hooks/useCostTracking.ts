/**
 * useCostTracking.ts — Automatically records cost entries when agent sessions complete.
 *
 * Watches for sessions transitioning to 'complete' or 'error' and saves
 * a cost entry via the cost IPC API. Deduplicates by session ID.
 */

import { useEffect, useRef } from 'react'
import type { AgentSession } from '../components/AgentMonitor/types'
import type { CostEntry } from '../types/electron'
import { estimateCost } from '../components/AgentMonitor/costCalculator'

function isFinishedSession(session: AgentSession): boolean {
  return session.status === 'complete' || session.status === 'error'
}

function shouldRecord(session: AgentSession, recorded: Set<string>): boolean {
  return isFinishedSession(session) && !recorded.has(session.id) && !session.restored
}

function formatDateStr(timestamp: number | undefined): string {
  const now = new Date(timestamp ?? Date.now())
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildCostEntry(session: AgentSession): CostEntry {
  const cost = estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  })

  return {
    date: formatDateStr(session.completedAt),
    sessionId: session.id,
    taskLabel: session.taskLabel,
    model: session.model ?? 'unknown',
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    cacheReadTokens: session.cacheReadTokens ?? 0,
    cacheWriteTokens: session.cacheWriteTokens ?? 0,
    estimatedCost: cost.totalCost,
    timestamp: session.completedAt ?? Date.now(),
  }
}

/**
 * Monitors agent sessions and auto-records cost entries when they finish.
 */
export function useCostTracking(sessions: AgentSession[]): void {
  const recordedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!window.electronAPI?.cost?.addEntry) return

    for (const session of sessions) {
      if (!shouldRecord(session, recordedRef.current)) continue

      recordedRef.current.add(session.id)

      const entry = buildCostEntry(session)
      window.electronAPI.cost.addEntry(entry).catch(() => {
        // Non-fatal — ignore save errors
      })
    }
  }, [sessions])
}
