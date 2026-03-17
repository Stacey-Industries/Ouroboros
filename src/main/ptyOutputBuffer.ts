/**
 * Rolling terminal output buffer for PTY sessions.
 *
 * Captures a per-session ring buffer of cleaned terminal output (ANSI-stripped,
 * secret-redacted, deduplicated) for injection into agent context packets.
 *
 * Design constraints:
 * - O(1) append per data chunk (push + splice when over limit)
 * - ~500KB total memory cap across all sessions
 * - No external dependencies — ANSI stripping is regex-based
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { TerminalSessionSnapshot } from './orchestration/types'

export type { TerminalSessionSnapshot }

export interface TerminalOutputBufferAPI {
  append(sessionId: string, data: string): void
  getRecentLines(sessionId: string, maxLines?: number): string[]
  getAllRecentLines(maxLines?: number): TerminalSessionSnapshot[]
  removeSession(sessionId: string): void
  clear(): void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_LINES_PER_SESSION = 200
const MAX_LINE_LENGTH = 500
const TOTAL_MEMORY_CAP_BYTES = 500 * 1024 // 500 KB

/**
 * ANSI escape sequence stripping regex.
 * Covers: SGR color codes, OSC sequences, charset switching, DEC private
 * modes, cursor movement, carriage returns.
 */
const ANSI_STRIP_RE =
  // eslint-disable-next-line no-control-regex
  /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b\[\??\d*[hl]|\r/g

/**
 * Secret pattern — lines matching this have the value portion redacted.
 */
const SECRET_RE =
  /(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY)=\S+/gi

// ---------------------------------------------------------------------------
// Per-session buffer
// ---------------------------------------------------------------------------

interface SessionBuffer {
  lines: string[]
  /** Partial line waiting for a terminating newline. */
  partial: string
  /** Last stored line (for dedup). */
  lastLine: string
  /** Count of consecutive duplicates of lastLine. */
  dupCount: number
  /** Approximate byte size of all stored lines. */
  byteSize: number
}

function createSessionBuffer(): SessionBuffer {
  return { lines: [], partial: '', lastLine: '', dupCount: 0, byteSize: 0 }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripAnsi(raw: string): string {
  return raw.replace(ANSI_STRIP_RE, '')
}

function redactSecrets(line: string): string {
  return line.replace(SECRET_RE, (_match, key: string) => `${key}=[REDACTED]`)
}

/**
 * Clean a single line: strip ANSI, redact secrets, truncate if too long,
 * strip control characters (except tab).
 */
function cleanLine(raw: string): string {
  let line = stripAnsi(raw)
  // Strip remaining control chars (keep tabs and spaces)
  // eslint-disable-next-line no-control-regex
  line = line.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  line = redactSecrets(line)
  if (line.length > MAX_LINE_LENGTH) {
    line = line.slice(0, MAX_LINE_LENGTH) + '...(truncated)'
  }
  return line
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class TerminalOutputBuffer implements TerminalOutputBufferAPI {
  private buffers = new Map<string, SessionBuffer>()
  private maxLinesPerSession: number
  private totalByteSize = 0

  constructor(maxLinesPerSession = DEFAULT_MAX_LINES_PER_SESSION) {
    this.maxLinesPerSession = maxLinesPerSession
  }

  append(sessionId: string, data: string): void {
    let buf = this.buffers.get(sessionId)
    if (!buf) {
      buf = createSessionBuffer()
      this.buffers.set(sessionId, buf)
    }

    // Combine with any partial line from a previous chunk
    const combined = buf.partial + data
    const segments = combined.split('\n')

    // The last segment is a partial line (no trailing newline yet) unless
    // the data ended with \n, in which case it's an empty string.
    buf.partial = segments.pop() ?? ''

    for (const rawSegment of segments) {
      const cleaned = cleanLine(rawSegment)
      // Skip empty lines
      if (cleaned.trim().length === 0) continue

      // Deduplicate consecutive identical lines
      if (cleaned === buf.lastLine) {
        buf.dupCount++
        continue
      }

      // If we had duplicates queued, flush a summary line
      if (buf.dupCount > 0) {
        const dupNote = `  ... (repeated ${buf.dupCount} more time${buf.dupCount > 1 ? 's' : ''})`
        this.pushLine(buf, dupNote)
      }

      buf.lastLine = cleaned
      buf.dupCount = 0
      this.pushLine(buf, cleaned)
    }

    // Enforce global memory cap
    this.enforceMemoryCap()
  }

  getRecentLines(sessionId: string, maxLines = DEFAULT_MAX_LINES_PER_SESSION): string[] {
    const buf = this.buffers.get(sessionId)
    if (!buf) return []
    const lines = [...buf.lines]  // copy to avoid mutation
    // Flush pending duplicate count
    if (buf.dupCount > 0) {
      lines.push(`  ... (repeated ${buf.dupCount} more time${buf.dupCount > 1 ? 's' : ''})`)
    }
    const count = Math.min(maxLines, lines.length)
    return lines.slice(-count)
  }

  getAllRecentLines(maxLines = DEFAULT_MAX_LINES_PER_SESSION): TerminalSessionSnapshot[] {
    const snapshots: TerminalSessionSnapshot[] = []
    for (const [sessionId, buf] of this.buffers) {
      if (buf.lines.length === 0 && buf.dupCount === 0) continue
      const lines = [...buf.lines]  // copy to avoid mutation
      // Flush pending duplicate count
      if (buf.dupCount > 0) {
        lines.push(`  ... (repeated ${buf.dupCount} more time${buf.dupCount > 1 ? 's' : ''})`)
      }
      const count = Math.min(maxLines, lines.length)
      snapshots.push({
        sessionId,
        lines: lines.slice(-count),
        capturedAt: Date.now(),
      })
    }
    return snapshots
  }

  removeSession(sessionId: string): void {
    const buf = this.buffers.get(sessionId)
    if (buf) {
      this.totalByteSize -= buf.byteSize
      this.buffers.delete(sessionId)
    }
  }

  clear(): void {
    this.buffers.clear()
    this.totalByteSize = 0
  }

  // -- Private helpers -----------------------------------------------------

  private pushLine(buf: SessionBuffer, line: string): void {
    const lineBytes = line.length * 2 // rough estimate (JS uses UTF-16)
    buf.lines.push(line)
    buf.byteSize += lineBytes
    this.totalByteSize += lineBytes

    // Enforce per-session limit
    while (buf.lines.length > this.maxLinesPerSession) {
      const removed = buf.lines.shift()!
      const removedBytes = removed.length * 2
      buf.byteSize -= removedBytes
      this.totalByteSize -= removedBytes
    }
  }

  /**
   * If total memory exceeds the cap, evict lines from the oldest sessions
   * (by insertion order in the Map) until we're back under budget.
   */
  private enforceMemoryCap(): void {
    if (this.totalByteSize <= TOTAL_MEMORY_CAP_BYTES) return

    for (const [sessionId, buf] of this.buffers) {
      while (buf.lines.length > 0 && this.totalByteSize > TOTAL_MEMORY_CAP_BYTES) {
        const removed = buf.lines.shift()!
        const removedBytes = removed.length * 2
        buf.byteSize -= removedBytes
        this.totalByteSize -= removedBytes
      }
      if (buf.lines.length === 0) {
        this.buffers.delete(sessionId)
      }
      if (this.totalByteSize <= TOTAL_MEMORY_CAP_BYTES) break
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const terminalOutputBuffer: TerminalOutputBufferAPI = new TerminalOutputBuffer()
