/**
 * ptyElectronBatcher.ts — Batches PTY output for Electron IPC delivery.
 *
 * node-pty fires onData for every tiny chunk (sometimes single bytes).
 * Sending each as a separate IPC message saturates the Electron message
 * queue during heavy output (npm install, test runs, Claude Code sessions).
 * This batcher collects chunks per-session and flushes every 16ms (~60fps),
 * matching the browser's render frame rate.
 */

import { type BrowserWindow } from 'electron';

interface SessionEntry {
  win: BrowserWindow;
  chunks: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

class PtyElectronBatcher {
  private sessions = new Map<string, SessionEntry>();

  /**
   * Register a BrowserWindow for a session. Must be called before append().
   */
  register(id: string, win: BrowserWindow): void {
    this.sessions.set(id, { win, chunks: [], timer: null });
  }

  /**
   * Append PTY data for a session. Starts a 16ms flush timer if not running.
   */
  append(id: string, data: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      return;
    }
    entry.chunks.push(data);
    if (!entry.timer) {
      entry.timer = setTimeout(() => this.flushSession(id), 16);
    }
  }

  private flushSession(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      return;
    }
    entry.timer = null;
    if (entry.chunks.length === 0) {
      return;
    }
    const joined = entry.chunks.join('');
    entry.chunks = [];
    try {
      if (!entry.win.isDestroyed()) {
        entry.win.webContents.mainFrame.send(`pty:data:${id}`, joined);
      }
    } catch {
      // Render frame disposed — safe to ignore
    }
  }

  /**
   * Flush remaining data and remove the session entry (call on session cleanup).
   */
  cleanup(id: string): void {
    this.flushSession(id);
    const entry = this.sessions.get(id);
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    this.sessions.delete(id);
  }

  /**
   * Flush all sessions and clear state (call on app shutdown).
   */
  dispose(): void {
    for (const id of this.sessions.keys()) {
      this.cleanup(id);
    }
  }
}

/** Singleton batcher instance for Electron IPC PTY delivery */
export const electronBatcher = new PtyElectronBatcher();
