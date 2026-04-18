// ---------------------------------------------------------------------------
// PTY Agent Bridge — bridges PTY output to structured chat events.
//
// Attaches to a PTY session's data stream, parses NDJSON lines (the same
// format as stream-json), and emits structured StreamJsonEvent objects via
// callback.  Handles partial lines since PTY data arrives in arbitrary chunks.
// ---------------------------------------------------------------------------

import type {
  StreamJsonEvent,
  StreamJsonResultEvent,
} from './orchestration/providers/streamJsonTypes'

// ---- Session event subscriber bus (Wave 36 Phase B) -----------------------
//
// Allows post-spawn consumers (e.g. ClaudeSessionProvider) to subscribe to
// events emitted by an existing bridge without modifying createAgentBridge's
// callback signature.

type SessionEventCallback = (event: StreamJsonEvent) => void

const sessionSubscribers = new Map<string, Set<SessionEventCallback>>()

/**
 * Subscribe to StreamJsonEvents for a given PTY session.
 * Returns a cleanup function — call it to unsubscribe.
 */
export function subscribeSessionEvents(
  sessionId: string,
  cb: SessionEventCallback,
): () => void {
  let subs = sessionSubscribers.get(sessionId)
  if (!subs) {
    subs = new Set()
    sessionSubscribers.set(sessionId, subs)
  }
  subs.add(cb)
  return () => {
    const s = sessionSubscribers.get(sessionId)
    if (s) {
      s.delete(cb)
      if (s.size === 0) sessionSubscribers.delete(sessionId)
    }
  }
}

/** @internal Publish an event to all subscribers for a session. */
function publishToSubscribers(sessionId: string, event: StreamJsonEvent): void {
  const subs = sessionSubscribers.get(sessionId)
  if (!subs) return
  for (const cb of subs) cb(event)
}

// ---- Types ----------------------------------------------------------------

export interface AgentBridgeOptions {
  sessionId: string
  onEvent: (event: StreamJsonEvent) => void
  onComplete: (result: StreamJsonResultEvent | null, exitCode: number | null) => void
}

export interface AgentBridgeHandle {
  /** Feed raw PTY data into the parser */
  feed(data: string): void
  /** Signal that the PTY session has exited */
  handleExit(exitCode: number): void
  /** Clean up */
  dispose(): void
}

// ---- NDJSON line parser (mirrors claudeStreamJsonRunner.tryParseEvent) -----

function tryParseEvent(line: string): StreamJsonEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed as StreamJsonEvent
    }
    // Valid JSON but no 'type' field — skip (could be terminal escape junk)
    return null
  } catch {
    // Not valid JSON — expected for terminal escape sequences, prompts, etc.
    return null
  }
}

// ---- Factory --------------------------------------------------------------

export function createAgentBridge(options: AgentBridgeOptions): AgentBridgeHandle {
  let lineBuffer = ''
  let resultEvent: StreamJsonResultEvent | null = null
  let disposed = false

  function processLine(line: string): void {
    if (disposed) return

    const event = tryParseEvent(line)
    if (!event) return

    // Capture result event for onComplete
    if (event.type === 'result') {
      resultEvent = event as StreamJsonResultEvent
    }

    options.onEvent(event)
    publishToSubscribers(options.sessionId, event)
  }

  function feed(data: string): void {
    if (disposed) return

    lineBuffer += data

    // Process all complete lines (delimited by \n)
    let newlineIdx: number
    while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, newlineIdx)
      lineBuffer = lineBuffer.slice(newlineIdx + 1)
      processLine(line)
    }
  }

  function handleExit(exitCode: number): void {
    if (disposed) return

    // Flush any remaining partial line in the buffer
    if (lineBuffer.trim()) {
      processLine(lineBuffer)
      lineBuffer = ''
    }

    options.onComplete(resultEvent, exitCode)
  }

  function dispose(): void {
    disposed = true
    lineBuffer = ''
    resultEvent = null
  }

  return { feed, handleExit, dispose }
}
