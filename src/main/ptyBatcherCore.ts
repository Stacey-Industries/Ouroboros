/**
 * ptyBatcherCore.ts — Generic per-session 16ms PTY data batcher.
 *
 * node-pty fires onData for every tiny chunk (sometimes single bytes). Sending
 * each as a separate IPC or WebSocket message saturates the message queue
 * during heavy output. This core collects chunks per-session and flushes every
 * `flushMs` (default 16ms ≈ 60fps), matching the browser's render frame rate.
 *
 * Used by:
 *   - ptyElectronBatcher.ts — flushes via win.webContents.mainFrame.send()
 *   - web/ptyBatcher.ts — flushes via broadcastToWebClients()
 *
 * The transport is parameterized via the `flushFn` callback. Per-session state
 * carries an arbitrary context object (e.g. a BrowserWindow reference).
 */

const DEFAULT_FLUSH_MS = 16;

export type PtyBatcherFlushFn<TContext> = (
  id: string,
  context: TContext,
  joined: string,
) => void;

interface SessionEntry<TContext> {
  context: TContext;
  chunks: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

export class PtyBatcherCore<TContext> {
  private readonly flushFn: PtyBatcherFlushFn<TContext>;
  private readonly flushMs: number;
  private sessions = new Map<string, SessionEntry<TContext>>();

  constructor(flushFn: PtyBatcherFlushFn<TContext>, flushMs = DEFAULT_FLUSH_MS) {
    this.flushFn = flushFn;
    this.flushMs = flushMs;
  }

  /** Register a session with its transport context. Required before append(). */
  register(id: string, context: TContext): void {
    this.sessions.set(id, { context, chunks: [], timer: null });
  }

  /** True if a session is registered. */
  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /**
   * Append PTY data for a session. Starts a flush timer if not already running.
   * Silently no-ops if the session is not registered.
   */
  append(id: string, data: string): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    entry.chunks.push(data);
    if (!entry.timer) {
      entry.timer = setTimeout(() => this.flushSession(id), this.flushMs);
    }
  }

  private flushSession(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    entry.timer = null;
    if (entry.chunks.length === 0) return;
    const joined = entry.chunks.join('');
    entry.chunks = [];
    try {
      this.flushFn(id, entry.context, joined);
    } catch {
      // Transport error (e.g. destroyed window) — safe to ignore.
    }
  }

  /** Flush remaining data and remove the session entry. */
  cleanup(id: string): void {
    this.flushSession(id);
    const entry = this.sessions.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    this.sessions.delete(id);
  }

  /** Flush all sessions and clear state (call on app shutdown). */
  dispose(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.cleanup(id);
    }
  }
}
