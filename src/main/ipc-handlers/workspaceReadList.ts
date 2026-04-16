/**
 * ipc-handlers/workspaceReadList.ts — IPC handler registrar for workspace read-lists (Wave 25 Phase E).
 *
 * Channels:
 *   workspaceReadList:get    { projectRoot }         → { success, files }
 *   workspaceReadList:add    { projectRoot, filePath } → { success, files }
 *   workspaceReadList:remove { projectRoot, filePath } → { success, files }
 *
 * Emits workspaceReadList:changed to all windows on every mutation.
 */

import { BrowserWindow, ipcMain } from 'electron';

import log from '../logger';
import {
  addToReadList,
  getReadList,
  removeFromReadList,
} from '../orchestration/workspaceReadList';

// ─── Response helpers ─────────────────────────────────────────────────────────

type OkResult<T extends object> = { success: true } & T;
type FailResult = { success: false; error: string };
type HandlerResult<T extends object> = OkResult<T> | FailResult;

function ok<T extends object>(data: T): OkResult<T> {
  return { success: true, ...data };
}

function fail(err: unknown): FailResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: msg };
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcastChanged(projectRoot: string, files: string[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('workspaceReadList:changed', { projectRoot, files });
    }
  });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleGet(args: unknown): HandlerResult<{ files: string[] }> {
  const { projectRoot } = (args ?? {}) as { projectRoot?: string };
  if (typeof projectRoot !== 'string' || !projectRoot) return fail('projectRoot is required');
  return ok({ files: getReadList(projectRoot) });
}

function handleAdd(args: unknown): HandlerResult<{ files: string[] }> {
  const { projectRoot, filePath } = (args ?? {}) as { projectRoot?: string; filePath?: string };
  if (typeof projectRoot !== 'string' || !projectRoot) return fail('projectRoot is required');
  if (typeof filePath !== 'string' || !filePath) return fail('filePath is required');
  const files = addToReadList(projectRoot, filePath);
  broadcastChanged(projectRoot, files);
  return ok({ files });
}

function handleRemove(args: unknown): HandlerResult<{ files: string[] }> {
  const { projectRoot, filePath } = (args ?? {}) as { projectRoot?: string; filePath?: string };
  if (typeof projectRoot !== 'string' || !projectRoot) return fail('projectRoot is required');
  if (typeof filePath !== 'string' || !filePath) return fail('filePath is required');
  const files = removeFromReadList(projectRoot, filePath);
  broadcastChanged(projectRoot, files);
  return ok({ files });
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerWorkspaceReadListHandlers(): string[] {
  const channels: string[] = [];

  function reg(channel: string, handler: (...args: unknown[]) => unknown): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await Promise.resolve(handler(...args));
      } catch (err) {
        log.error(`[workspaceReadList ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('workspaceReadList:get', (args) => handleGet(args));
  reg('workspaceReadList:add', (args) => handleAdd(args));
  reg('workspaceReadList:remove', (args) => handleRemove(args));

  registeredChannels = channels;
  return channels;
}

export function cleanupWorkspaceReadListHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
