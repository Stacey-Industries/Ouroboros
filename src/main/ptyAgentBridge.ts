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

// ---- System-prompt cache (Wave 37 Phase A) --------------------------------
//
// Caches the first `system` stream-json event per PTY session so the
// IPC handler can serve it without re-parsing logs.  The text may contain
// sensitive project context — NEVER log it.

export interface SystemPromptEntry {
  text: string
  at: number
}

const systemPromptCache = new Map<string, SystemPromptEntry>()

/**
 * Return the cached system prompt for a session, or null if not yet captured.
 */
export function getSystemPromptForSession(sessionId: string): SystemPromptEntry | null {
  return systemPromptCache.get(sessionId) ?? null
}

/**
 * Remove the cached system prompt for a session (call on session close).
 */
export function clearSystemPromptForSession(sessionId: string): void {
  systemPromptCache.delete(sessionId)
}

// ---- Factory helpers -------------------------------------------------------

/**
 * Attempt to cache the system prompt from a system/init event.
 * Only runs once per session (first init wins).
 * NEVER log the text — may contain sensitive project context.
 */
function maybeCacheSystemPrompt(sessionId: string, event: StreamJsonEvent): void {
  if (event.type !== 'system' || event.subtype !== 'init') return
  if (systemPromptCache.has(sessionId)) return
  const raw = event as Record<string, unknown>
  const text =
    typeof raw['system_prompt'] === 'string'
      ? raw['system_prompt']
      : JSON.stringify(event)
  systemPromptCache.set(sessionId, { text, at: Date.now() })
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

    if (event.type === 'result') {
      resultEvent = event as StreamJsonResultEvent
    }

    maybeCacheSystemPrompt(options.sessionId, event)
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
