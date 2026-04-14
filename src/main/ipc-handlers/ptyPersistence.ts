/**
 * ipc-handlers/ptyPersistence.ts — IPC handlers for PTY session persistence.
 *
 * Registers three channels:
 *   pty:listPersistedSessions   — list sessions from the last run
 *   pty:restoreSession          — respawn a PTY with saved cwd/shell/dims
 *   pty:discardPersistedSessions — wipe all persisted records
 *
 * Note: respawned PTYs get NEW PIDs. Prior shell state (history, running
 * processes, env) is not recoverable. The renderer should make this clear
 * in any restore UI.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import { spawnPty } from '../pty';
import type { PtyPersistence } from '../ptyPersistence';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

function registerListHandler(channels: string[], store: PtyPersistence): void {
  ipcMain.handle('pty:listPersistedSessions', () => {
    if (!store.isEnabled()) return [];
    return store.listSessions();
  });
  channels.push('pty:listPersistedSessions');
}

function registerRestoreHandler(
  channels: string[],
  store: PtyPersistence,
  senderWindow: SenderWindow,
): void {
  ipcMain.handle('pty:restoreSession', async (event, id: string) => {
    if (!store.isEnabled()) {
      return { success: false, error: 'persistTerminalSessions is disabled' };
    }
    const sessions = store.listSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      return { success: false, error: `Persisted session ${id} not found` };
    }
    const win = senderWindow(event);
    const result = await spawnPty(id, win, {
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
    });
    if (result.success) {
      store.updateSession(id, { lastSeenAt: Date.now() });
    }
    return result;
  });
  channels.push('pty:restoreSession');
}

function registerDiscardHandler(channels: string[], store: PtyPersistence): void {
  ipcMain.handle('pty:discardPersistedSessions', () => {
    if (!store.isEnabled()) return { success: true };
    store.clearAll();
    return { success: true };
  });
  channels.push('pty:discardPersistedSessions');
}

export function registerPtyPersistenceHandlers(
  senderWindow: SenderWindow,
  store: PtyPersistence,
): string[] {
  const channels: string[] = [];
  registerListHandler(channels, store);
  registerRestoreHandler(channels, store, senderWindow);
  registerDiscardHandler(channels, store);
  return channels;
}
