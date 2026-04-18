/**
 * Wave 36 Phase D — Gemini CLI SessionProvider adapter.
 *
 * Spawns the `gemini` CLI binary in headless mode and translates its output
 * stream to the common SessionEvent shape.
 *
 * Spawn path: `gemini --prompt "<text>" --yolo` (non-interactive, disables
 * confirmation prompts). Falls back to `--prompt "<text>"` if --yolo is not
 * supported by the installed version.
 *
 * Assumptions (document for future correction):
 * - Invocation: `gemini --prompt "<prompt>" --yolo`
 *   The `--yolo` flag is the Gemini CLI's non-interactive / no-confirm mode
 *   (observed in google-gemini/gemini-cli README at Wave 36 planning time).
 *   If the installed CLI version uses a different flag (e.g. --non-interactive
 *   or --no-confirm), the user should override via `geminiCliSettings.extraArgs`.
 * - Output format: the CLI may emit plain text or NDJSON lines. We attempt
 *   JSON.parse on each stdout line; lines that are not valid JSON are emitted
 *   as raw `stdout` events. JSON objects with a `text` or `content` field are
 *   normalised to a `stdout` event.
 *
 * Known gaps (intentional for Wave 36):
 * - No formal Gemini CLI output schema followed — heuristic NDJSON + stdout fallback.
 * - No tool-use events translated — Gemini CLI doesn't emit tool traces in a
 *   known, stable format as of Wave 36 planning.
 * - No resume / thread continuity — each spawn is an independent single-turn
 *   session. Follow-up turns require a new spawn with context re-supplied by
 *   the caller.
 * - Auth must be configured externally via `GEMINI_API_KEY` env var or the
 *   Gemini CLI's own OAuth/config (`gemini auth`). The IDE does not manage
 *   Gemini credentials.
 * - No streaming cost/token metadata translated — Gemini CLI does not emit
 *   usage fields in a known stable format; `cost-update` events are omitted.
 */

import type { ChildProcess } from 'child_process'
import { execFile, spawn } from 'child_process'

import log from '../logger'
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

interface GeminiHandleEntry {
  process: ChildProcess
  subscribers: Set<(e: SessionEvent) => void>
}

const geminiHandles = new Map<string, GeminiHandleEntry>()

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

/** Attempt to parse a stdout line as JSON; extract text if possible. */
function translateLine(line: string, sessionId: string): SessionEvent {
  const trimmed = line.trim()
  if (!trimmed) return makeEvent('stdout', sessionId, '')

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const text = parsed['text'] ?? parsed['content'] ?? null
    if (typeof text === 'string') {
      return makeEvent('stdout', sessionId, text)
    }
    if (parsed['error']) {
      return makeEvent('error', sessionId, { raw: parsed })
    }
    // Recognised JSON but no known text field — emit as stdout with raw object.
    return makeEvent('stdout', sessionId, { raw: parsed })
  } catch {
    // Not JSON — emit raw text line.
    return makeEvent('stdout', sessionId, trimmed)
  }
}

function publishEvent(sessionId: string, event: SessionEvent): void {
  const entry = geminiHandles.get(sessionId)
  if (!entry) return
  for (const cb of entry.subscribers) cb(event)
}

// ---------------------------------------------------------------------------
// Spawn helper
// ---------------------------------------------------------------------------

function buildCliArgs(prompt: string): string[] {
  return ['--prompt', prompt, '--yolo']
}

function attachProcessListeners(proc: ChildProcess, sessionId: string): void {
  let lineBuffer = ''

  proc.stdout?.on('data', (chunk: Buffer | string) => {
    lineBuffer += chunk.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      publishEvent(sessionId, translateLine(line, sessionId))
    }
  })

  proc.stderr?.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString().trim()
    if (text) publishEvent(sessionId, makeEvent('stderr', sessionId, text))
  })

  proc.on('close', (code) => {
    if (lineBuffer.trim()) {
      publishEvent(sessionId, translateLine(lineBuffer, sessionId))
    }
    if (code !== 0) {
      publishEvent(sessionId, makeEvent('error', sessionId, { exitCode: code }))
    }
    publishEvent(sessionId, makeEvent('completion', sessionId, { exitCode: code }))
    geminiHandles.delete(sessionId)
    log.info(`[GeminiSessionProvider] session ${sessionId} closed (exit ${code})`)
  })

  proc.on('error', (err: Error) => {
    publishEvent(sessionId, makeEvent('error', sessionId, { message: err.message }))
    geminiHandles.delete(sessionId)
  })
}

function spawnGeminiSession(opts: SpawnOptions): SessionHandle {
  const args = buildCliArgs(opts.prompt)
  const proc = spawn('gemini', args, {
    cwd: opts.projectPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })

  const entry: GeminiHandleEntry = { process: proc, subscribers: new Set() }
  geminiHandles.set(opts.sessionId, entry)

  attachProcessListeners(proc, opts.sessionId)

  log.info(`[GeminiSessionProvider] spawned session ${opts.sessionId} pid=${proc.pid}`)
  return {
    id: opts.sessionId,
    providerId: 'gemini',
    ptySessionId: opts.sessionId,
    startedAt: Date.now(),
    status: 'starting',
  }
}

// ---------------------------------------------------------------------------
// GeminiSessionProvider
// ---------------------------------------------------------------------------

export class GeminiSessionProvider implements SessionProvider {
  readonly id = 'gemini'
  readonly label = 'Gemini (Google)'
  readonly binary = 'gemini'

  checkAvailability(): Promise<AvailabilityResult> {
    return new Promise((resolve) => {
      execFile('gemini', ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve({ available: false, reason: err.message })
          return
        }
        const version = stdout.trim().split('\n')[0] ?? ''
        resolve({ available: true, binary: 'gemini', version })
      })
    })
  }

  spawn(opts: SpawnOptions): Promise<SessionHandle> {
    return Promise.resolve(spawnGeminiSession(opts))
  }

  async send(handle: SessionHandle, text: string): Promise<void> {
    // Gemini CLI sessions are single-turn: prompt supplied at spawn via --prompt.
    // Follow-up turns require a new spawn with context re-supplied by the caller.
    log.warn(
      `[GeminiSessionProvider] send() no-op for session ${handle.id} (text length: ${text.length})`,
    )
  }

  async cancel(handle: SessionHandle): Promise<void> {
    const entry = geminiHandles.get(handle.id)
    if (!entry) {
      log.warn(`[GeminiSessionProvider] cancel: no active session for ${handle.id}`)
      return
    }
    try {
      entry.process.kill('SIGTERM')
    } catch (err) {
      log.warn(`[GeminiSessionProvider] cancel failed for ${handle.id}:`, err)
    }
  }

  onEvent(handle: SessionHandle, cb: (e: SessionEvent) => void): () => void {
    const entry = geminiHandles.get(handle.id)
    if (!entry) {
      log.warn(`[GeminiSessionProvider] onEvent: no active session for ${handle.id}`)
      return () => undefined
    }
    entry.subscribers.add(cb)
    return () => {
      const e = geminiHandles.get(handle.id)
      if (e) e.subscribers.delete(cb)
    }
  }
}
