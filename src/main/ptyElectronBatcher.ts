/**
 * ptyElectronBatcher.ts — Batches PTY output for Electron IPC delivery.
 *
 * Thin wrapper around PtyBatcherCore that uses BrowserWindow.webContents
 * as the per-session context and sends batched output via the
 * `pty:data:${id}` channel.
 */

import { type BrowserWindow } from 'electron';

import { PtyBatcherCore } from './ptyBatcherCore';

function flushToWindow(id: string, win: BrowserWindow, joined: string): void {
  if (win.isDestroyed()) return;
  win.webContents.mainFrame.send(`pty:data:${id}`, joined);
}

class PtyElectronBatcher {
  private core = new PtyBatcherCore<BrowserWindow>(flushToWindow);

  register(id: string, win: BrowserWindow): void {
    this.core.register(id, win);
  }

  append(id: string, data: string): void {
    this.core.append(id, data);
  }

  cleanup(id: string): void {
    this.core.cleanup(id);
  }

  dispose(): void {
    this.core.dispose();
  }
}

/** Singleton batcher instance for Electron IPC PTY delivery */
export const electronBatcher = new PtyElectronBatcher();
