/**
 * promptDiffScheduler.ts — Triggers prompt-diff check when a session's
 * system prompt is first captured by ptyAgentBridge.
 *
 * Wave 37 Phase B. Subscribes to session events; on the first `system/init`
 * event, calls checkPromptChanged and — if changed — pushes
 * `ecosystem:promptDiff` to all active BrowserWindows.
 *
 * NEVER log the prompt text.
 */

import log from './logger'
import type { StreamJsonEvent } from './orchestration/providers/streamJsonTypes'
import { checkPromptChanged } from './promptDiff'
import { subscribeSessionEvents } from './ptyAgentBridge'
import { getAllActiveWindows } from './windowManager'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromptDiffPayload {
  previousText: string
  currentText: string
  linesAdded: number
  linesRemoved: number
}

// ── State ─────────────────────────────────────────────────────────────────────

/** Sessions for which we have already triggered the diff check. */
const checkedSessions = new Set<string>()

// ── Internal ──────────────────────────────────────────────────────────────────

function extractPromptText(event: StreamJsonEvent): string | null {
  if (event.type !== 'system' || event.subtype !== 'init') return null
  const raw = event as Record<string, unknown>
  if (typeof raw['system_prompt'] === 'string') return raw['system_prompt']
  return null
}

async function runDiffCheck(promptText: string): Promise<void> {
  try {
    const result = await checkPromptChanged(promptText)
    if (!result.changed) return

    const payload: PromptDiffPayload = {
      previousText: result.previousText,
      currentText: result.currentText,
      linesAdded: result.linesAdded,
      linesRemoved: result.linesRemoved,
    }

    const wins = getAllActiveWindows().filter((w) => !w.isDestroyed())
    for (const win of wins) {
      win.webContents.send('ecosystem:promptDiff', payload)
    }
    log.info(`[promptDiffScheduler] emitted ecosystem:promptDiff (+${payload.linesAdded} -${payload.linesRemoved})`)
  } catch (err) {
    log.warn('[promptDiffScheduler] diff check failed:', err)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attach a one-shot prompt-diff listener to the given PTY session.
 * Returns a cleanup function that unsubscribes if the session closes
 * before the first system/init event arrives.
 */
export function watchSessionForPromptDiff(sessionId: string): () => void {
  if (checkedSessions.has(sessionId)) return () => undefined

  let fired = false
  const unsubscribe = subscribeSessionEvents(sessionId, (event: StreamJsonEvent) => {
    if (fired) return
    const promptText = extractPromptText(event)
    if (promptText === null) return

    fired = true
    checkedSessions.add(sessionId)
    unsubscribe()
    void runDiffCheck(promptText)
  })

  return unsubscribe
}

/** Remove a session from the checked-sessions set (call on session close). */
export function clearPromptDiffSession(sessionId: string): void {
  checkedSessions.delete(sessionId)
}
