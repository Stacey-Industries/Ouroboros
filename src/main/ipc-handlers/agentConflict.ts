/**
 * ipc-handlers/agentConflict.ts — IPC registrar for parallel agent conflict detection.
 *
 * Exposes:
 *   agentConflict:getReports  — pull current snapshot
 *   agentConflict:dismiss     — suppress a session pair until new symbol touched
 *
 * Push channel:  agentConflict:change  (via webContents.send on every window)
 * Driven by conflictMonitor's 'snapshot' event.
 */

import type { AgentConflictSnapshot } from '@shared/types/agentConflict';
import { BrowserWindow, ipcMain } from 'electron';

import type { IpcResult } from '../../renderer/types/electron-foundation';
import { getConflictMonitor } from '../agentConflict/conflictMonitor';
import log from '../logger';

// ── Broadcast helpers ─────────────────────────────────────────────────────────

function broadcastConflictSnapshot(snapshot: AgentConflictSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('agentConflict:change', snapshot);
    }
  }
}

// ── Subscription setup (called once at init) ──────────────────────────────────

function subscribeToMonitor(): void {
  const monitor = getConflictMonitor();
  monitor.on('snapshot', (snapshot: AgentConflictSnapshot) => {
    broadcastConflictSnapshot(snapshot);
  });
}

// ── Handler implementations ───────────────────────────────────────────────────

function handleGetReports(projectRoot?: string): unknown {
  try {
    const snapshot = getConflictMonitor().getSnapshot(projectRoot);
    return { success: true, snapshot };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[agentConflict:getReports]', msg);
    return { success: false, error: msg } satisfies IpcResult;
  }
}

function handleDismiss(sessionA: string, sessionB: string): IpcResult {
  try {
    getConflictMonitor().dismiss(sessionA, sessionB);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[agentConflict:dismiss]', msg);
    return { success: false, error: msg };
  }
}

// ── IPC registration ──────────────────────────────────────────────────────────

export function registerAgentConflictHandlers(): string[] {
  subscribeToMonitor();

  ipcMain.handle('agentConflict:getReports', (_e, projectRoot?: string) =>
    handleGetReports(projectRoot),
  );
  ipcMain.handle('agentConflict:dismiss', (_e, sessionA: string, sessionB: string) =>
    handleDismiss(sessionA, sessionB),
  );

  return ['agentConflict:getReports', 'agentConflict:dismiss'];
}
