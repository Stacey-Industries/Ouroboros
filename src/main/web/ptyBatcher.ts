/**
 * ptyBatcher.ts — Batches PTY output for WebSocket delivery.
 *
 * Thin wrapper around PtyBatcherCore that broadcasts batched output to all
 * connected web clients via the `pty:data:${sessionId}` channel.
 *
 * Sessions are auto-registered on first append (web clients have no per-
 * session context to track — broadcastToWebClients fans out to all clients).
 */

import { PtyBatcherCore } from '../ptyBatcherCore'
import { broadcastToWebClients } from './webServer'

function flushToWebClients(id: string, _ctx: void, joined: string): void {
  broadcastToWebClients(`pty:data:${id}`, joined)
}

class PtyBatcher {
  private core = new PtyBatcherCore<void>(flushToWebClients)

  /**
   * Append PTY data for a session. Auto-registers on first append.
   */
  append(sessionId: string, data: string): void {
    if (!this.core.has(sessionId)) {
      this.core.register(sessionId, undefined)
    }
    this.core.append(sessionId, data)
  }

  /** Remove a session's buffer (call on session cleanup). */
  removeSession(sessionId: string): void {
    this.core.cleanup(sessionId)
  }

  /** Flush all sessions and clear state (call on shutdown). */
  dispose(): void {
    this.core.dispose()
  }
}

/** Singleton batcher instance */
export const ptyBatcher = new PtyBatcher()
