/**
 * Wave 36 Phase C — Codex SessionProvider adapter.
 *
 * Thin facade over the existing Codex exec machinery.
 * Does NOT rewrite spawn logic — delegates to `spawnCodexExecProcess`.
 *
 * Spawn path: Codex uses the headless exec path (codex exec --json), NOT the
 * interactive PTY path. This produces structured NDJSON output (CodexExecEvent)
 * which we translate to the common SessionEvent shape.
 *
 * Intentionally NOT translated to SessionEvent:
 * - item.started events: internal progress markers, not surfaced as text.
 * - thread.started: sets internal threadId only.
 * - turn.started: no semantic content.
 * - Codex tool traces: go as 'tool-use' with payload: { raw: CodexExecEvent }.
 *
 * send() is a no-op: Codex exec sessions consume a single prompt via stdin at
 * spawn time and do not support interactive follow-up turns.
 *
 * Known Codex quirks:
 * - Cost/token fields: `usage.input_tokens`, `usage.output_tokens`,
 *   `usage.cached_input_tokens` (vs Claude's `total_cost_usd` on result event).
 * - No total_cost_usd field — we normalise to { inputTokens, outputTokens } only.
 * - Completion is signalled by `turn.completed`, not a separate `result` event.
 * - Failure can arrive as `turn.failed`, `error`, or `item.completed` with error item.
 */

import { execFile } from 'child_process'

import { getConfigValue } from '../config'
import log from '../logger'
import type { CodexExecEvent } from '../orchestration/providers/codexExecRunner'
import { spawnCodexExecProcess } from '../orchestration/providers/codexExecRunner'
import type {
  CodexAgentMessageItem,
  CodexItemCompletedEvent,
  CodexTurnCompletedEvent,
  CodexTurnFailedEvent,
} from '../orchestration/providers/codexExecRunnerHelpers'
import type {
  AvailabilityResult,
  SessionEvent,
  SessionHandle,
  SessionProvider,
  SpawnOptions,
} from './sessionProvider'

// ---------------------------------------------------------------------------
// Module-level handle map — keyed by sessionId
// ---------------------------------------------------------------------------

interface CodexHandleEntry {
  kill: () => void
  subscribers: Set<(e: SessionEvent) => void>
}

const codexHandles = new Map<string, CodexHandleEntry>()

// ---------------------------------------------------------------------------
// Event translation helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: SessionEvent['type'],
  sessionId: string,
  payload: unknown,
): SessionEvent {
  return { type, sessionId, payload, at: Date.now() }
}

function translateItemCompleted(
  event: CodexItemCompletedEvent,
  sessionId: string,
): SessionEvent | null {
  const item = event.item
  if (item.type === 'agent_message') {
    const text = (item as CodexAgentMessageItem).text ?? ''
    if (!text) return null
    return makeEvent('stdout', sessionId, text)
  }
  if (item.type === 'command_execution' || item.type === 'file_change') {
    return makeEvent('tool-use', sessionId, { raw: event })
  }
  if (item.type === 'error') {
    return makeEvent('error', sessionId, { raw: event })
  }
  return makeEvent('tool-use', sessionId, { raw: event })
}

function translateTurnCompleted(event: CodexTurnCompletedEvent, sessionId: string): SessionEvent {
  const u = event.usage
  if (u) {
    return makeEvent('cost-update', sessionId, {
      inputTokens: u.input_tokens ?? 0,
      cachedInputTokens: u.cached_input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      raw: event,
    })
  }
  return makeEvent('completion', sessionId, { raw: event })
}

/** Returns null for events that carry no semantic content (thread.started, turn.started, item.started). */
function translateCodexEvent(event: CodexExecEvent, sessionId: string): SessionEvent | null {
  if (event.type === 'turn.completed') return translateTurnCompleted(event as CodexTurnCompletedEvent, sessionId)
  if (event.type === 'turn.failed') {
    const e = event as CodexTurnFailedEvent
    return makeEvent('error', sessionId, { message: e.error?.message, raw: e })
  }
  if (event.type === 'error') return makeEvent('error', sessionId, { raw: event })
  if (event.type === 'item.completed') return translateItemCompleted(event as CodexItemCompletedEvent, sessionId)
  if (event.type === 'thread.started' || event.type === 'turn.started' || event.type === 'item.started') return null
  // Unknown event type — emit as stdout so nothing is silently dropped.
  return makeEvent('stdout', sessionId, { raw: event })
}

function publishEvent(sessionId: string, event: SessionEvent): void {
  const entry = codexHandles.get(sessionId)
  if (!entry) return
  for (const cb of entry.subscribers) cb(event)
}

// ---------------------------------------------------------------------------
// Spawn helper
// ---------------------------------------------------------------------------

function buildOnEvent(sessionId: string) {
  return (raw: CodexExecEvent): void => {
    const translated = translateCodexEvent(raw, sessionId)
    if (translated) publishEvent(sessionId, translated)
  }
}

async function spawnCodexSession(opts: SpawnOptions): Promise<SessionHandle> {
  const settings = getConfigValue('codexCliSettings')
  const cliArgs: string[] = []
  if (settings.model) cliArgs.push('--model', settings.model)

  const handle = spawnCodexExecProcess({
    prompt: opts.prompt,
    cwd: opts.projectPath,
    cliArgs,
    resumeThreadId: opts.resumeThreadId,
    onEvent: buildOnEvent(opts.sessionId),
  })

  const entry: CodexHandleEntry = { kill: handle.kill, subscribers: new Set() }
  codexHandles.set(opts.sessionId, entry)

  handle.result
    .then((result) => {
      if (result.usage) {
        publishEvent(opts.sessionId, makeEvent('cost-update', opts.sessionId, {
          inputTokens: result.usage.input_tokens ?? 0,
          cachedInputTokens: result.usage.cached_input_tokens ?? 0,
          outputTokens: result.usage.output_tokens ?? 0,
        }))
      }
      publishEvent(opts.sessionId, makeEvent('completion', opts.sessionId, { threadId: result.threadId }))
    })
    .catch((err: Error) => {
      publishEvent(opts.sessionId, makeEvent('error', opts.sessionId, { message: err.message }))
    })
    .finally(() => {
      codexHandles.delete(opts.sessionId)
    })

  log.info(`[CodexSessionProvider] spawned session ${opts.sessionId}`)
  return {
    id: opts.sessionId,
    providerId: 'codex',
    ptySessionId: opts.sessionId,
    startedAt: Date.now(),
    status: 'starting',
  }
}

// ---------------------------------------------------------------------------
// CodexSessionProvider
// ---------------------------------------------------------------------------

export class CodexSessionProvider implements SessionProvider {
  readonly id = 'codex'
  readonly label = 'Codex (OpenAI)'
  readonly binary = 'codex'

  checkAvailability(): Promise<AvailabilityResult> {
    return new Promise((resolve) => {
      execFile('codex', ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve({ available: false, reason: err.message })
          return
        }
        const version = stdout.trim().split('\n')[0] ?? ''
        resolve({ available: true, binary: 'codex', version })
      })
    })
  }

  spawn(opts: SpawnOptions): Promise<SessionHandle> {
    return spawnCodexSession(opts)
  }

  async send(handle: SessionHandle, text: string): Promise<void> {
    // Codex exec sessions are single-turn: prompt sent at spawn via stdin.
    // Follow-up turns require a new spawn with resumeThreadId.
    log.warn(`[CodexSessionProvider] send() no-op for exec session ${handle.id} (text length: ${text.length})`)
  }

  async cancel(handle: SessionHandle): Promise<void> {
    const entry = codexHandles.get(handle.id)
    if (!entry) {
      log.warn(`[CodexSessionProvider] cancel: no active session for ${handle.id}`)
      return
    }
    try {
      entry.kill()
    } catch (err) {
      log.warn(`[CodexSessionProvider] cancel failed for ${handle.id}:`, err)
    }
  }

  onEvent(handle: SessionHandle, cb: (e: SessionEvent) => void): () => void {
    const entry = codexHandles.get(handle.id)
    if (!entry) {
      log.warn(`[CodexSessionProvider] onEvent: no active session for ${handle.id}`)
      return () => undefined
    }
    entry.subscribers.add(cb)
    return () => {
      const e = codexHandles.get(handle.id)
      if (e) e.subscribers.delete(cb)
    }
  }
}
