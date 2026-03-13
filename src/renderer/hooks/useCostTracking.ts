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

/**
 * Monitors agent sessions and auto-records cost entries when they finish.
 */
export function useCostTracking(sessions: AgentSession[]): void {
  const recordedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!window.electronAPI?.cost?.addEntry) return

    for (const session of sessions) {
      // Only record completed or errored sessions
      if (session.status !== 'complete' && session.status !== 'error') continue
      // Skip already-recorded sessions
      if (recordedRef.current.has(session.id)) continue
      // Skip restored sessions (they were already recorded in a prior app run)
      if (session.restored) continue

      recordedRef.current.add(session.id)

      const cost = estimateCost({
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        model: session.model,
        cacheReadTokens: session.cacheReadTokens,
        cacheWriteTokens: session.cacheWriteTokens,
      })

      const now = new Date(session.completedAt ?? Date.now())
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      const entry: CostEntry = {
        date: dateStr,
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

      window.electronAPI.cost.addEntry(entry).catch(() => {
        // Non-fatal — ignore save errors
      })
    }
  }, [sessions])
}
