/**
 * ptyBatcher.ts — Batches PTY output for WebSocket delivery.
 *
 * node-pty fires onData for every tiny chunk (sometimes single bytes).
 * Sending each as a separate WebSocket frame is wasteful over a network.
 * This batcher collects chunks per-session and flushes every 16ms (~60fps),
 * matching the browser's render frame rate.
 */

import { broadcastToWebClients } from './webServer'

class PtyBatcher {
  private buffers = new Map<string, string[]>()
  private timer: ReturnType<typeof setTimeout> | null = null

  /**
   * Append PTY data for a session. Starts a 16ms flush timer if not already running.
   */
  append(sessionId: string, data: string): void {
    let buf = this.buffers.get(sessionId)
    if (!buf) {
      buf = []
      this.buffers.set(sessionId, buf)
    }
    buf.push(data)

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 16)
    }
  }

  /**
   * Flush all buffered data to web clients.
   */
  private flush(): void {
    this.timer = null
    for (const [sessionId, chunks] of this.buffers) {
      if (chunks.length > 0) {
        broadcastToWebClients(`pty:data:${sessionId}`, chunks.join(''))
      }
    }
    this.buffers.clear()
  }

  /**
   * Remove a session's buffer (call on session cleanup).
   */
  removeSession(sessionId: string): void {
    this.buffers.delete(sessionId)
  }

  /**
   * Flush immediately and clear all state (call on shutdown).
   */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.flush()
    this.buffers.clear()
  }
}

/** Singleton batcher instance */
export const ptyBatcher = new PtyBatcher()
