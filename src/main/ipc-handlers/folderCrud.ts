/**
 * ipc-handlers/folderCrud.ts — IPC handler registrar for folder store CRUD.
 *
 * Channels:
 *   folderCrud:list          → all folders
 *   folderCrud:create        → { name } → new folder
 *   folderCrud:rename        → { id, name }
 *   folderCrud:delete        → { id }
 *   folderCrud:addSession    → { folderId, sessionId }
 *   folderCrud:removeSession → { folderId, sessionId }
 *   folderCrud:moveSession   → { fromId: string|null, toId: string|null, sessionId }
 *
 * Emits folderCrud:changed to all renderer windows on every mutation.
 */

import { BrowserWindow, ipcMain } from 'electron';

import log from '../logger';
import type { SessionFolder } from '../session/folderStore';
import { getFolderStore } from '../session/folderStore';
import { getSessionStore } from '../session/sessionStore';

// ─── Response helpers ─────────────────────────────────────────────────────────

type HandlerOk<T> = { success: true } & T;
type HandlerFail = { success: false; error: string };
type HandlerResult<T> = HandlerOk<T> | HandlerFail;

function ok<T extends object>(data: T): HandlerOk<T> {
  return { success: true, ...data };
}

function fail(err: unknown): HandlerFail {
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: msg };
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcastChanged(): void {
  const folders = getFolderStore()?.listAll() ?? [];
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('folderCrud:changed', folders);
  });
}

function broadcastSessionsChanged(): void {
  const sessions = getSessionStore()?.listAll() ?? [];
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('sessionCrud:changed', sessions);
  });
}

// ─── ID generation ────────────────────────────────────────────────────────────

function makeFolderId(): string {
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function handleList(): HandlerResult<{ folders: SessionFolder[] }> {
  const store = getFolderStore();
  if (!store) return ok({ folders: [] });
  return ok({ folders: store.listAll() });
}

function handleCreate(args: unknown): HandlerResult<{ folder: SessionFolder }> {
  const { name } = (args ?? {}) as { name?: string };
  if (typeof name !== 'string' || !name.trim()) return fail('name is required');
  const store = getFolderStore();
  if (!store) return fail('folderStore not initialised');
  const existing = store.listAll();
  const folder: SessionFolder = {
    id: makeFolderId(),
    name: name.trim(),
    sessionIds: [],
    createdAt: Date.now(),
    order: existing.length,
  };
  store.upsert(folder);
  broadcastChanged();
  return ok({ folder });
}

function handleRename(args: unknown): HandlerResult<object> {
  const { id, name } = (args ?? {}) as { id?: string; name?: string };
  if (typeof id !== 'string' || !id) return fail('id is required');
  if (typeof name !== 'string' || !name.trim()) return fail('name is required');
  const store = getFolderStore();
  if (!store) return fail('folderStore not initialised');
  const folder = store.listAll().find((f) => f.id === id);
  if (!folder) return fail(`folder not found: ${id}`);
  store.upsert({ ...folder, name: name.trim() });
  broadcastChanged();
  return ok({});
}

function handleDelete(args: unknown): HandlerResult<object> {
  const { id } = (args ?? {}) as { id?: string };
  if (typeof id !== 'string' || !id) return fail('id is required');
  const store = getFolderStore();
  if (!store) return fail('folderStore not initialised');

  // Capture orphaned sessionIds before deleting the folder record.
  const folder = store.listAll().find((f) => f.id === id);
  const orphanedSessionIds = folder?.sessionIds ?? [];

  store.delete(id);
  broadcastChanged();

  // Notify the renderer that each orphaned session's folder association is gone.
  if (orphanedSessionIds.length > 0) {
    log.info('[folderCrud] broadcasting sessionCrud:changed for orphaned sessions', orphanedSessionIds);
    broadcastSessionsChanged();
  }
  return ok({});
}

function handleAddSession(args: unknown): HandlerResult<object> {
  const { folderId, sessionId } = (args ?? {}) as { folderId?: string; sessionId?: string };
  if (typeof folderId !== 'string' || !folderId) return fail('folderId is required');
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  const store = getFolderStore();
  if (!store) return fail('folderStore not initialised');
  store.addSession(folderId, sessionId);
  broadcastChanged();
  return ok({});
}

function handleRemoveSession(args: unknown): HandlerResult<object> {
  const { folderId, sessionId } = (args ?? {}) as { folderId?: string; sessionId?: string };
  if (typeof folderId !== 'string' || !folderId) return fail('folderId is required');
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  const store = getFolderStore();
  if (!store) return fail('folderStore not initialised');
  store.removeSession(folderId, sessionId);
  broadcastChanged();
  return ok({});
}

function handleMoveSession(args: unknown): HandlerResult<object> {
  const { fromId, toId, sessionId } = (args ?? {}) as {
    fromId?: string | null;
    toId?: string | null;
    sessionId?: string;
  };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  const from = fromId ?? null;
  const to = toId ?? null;
  const store = getFolderStore();
  if (!store) return fail('folderStore not initialised');
  store.moveSessionBetweenFolders(from, to, sessionId);
  broadcastChanged();
  return ok({});
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerFolderCrudHandlers(): string[] {
  const channels: string[] = [];

  function reg(channel: string, handler: (...args: unknown[]) => unknown): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await Promise.resolve(handler(...args));
      } catch (err) {
        log.error(`[folderCrud ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('folderCrud:list', () => handleList());
  reg('folderCrud:create', (args) => handleCreate(args));
  reg('folderCrud:rename', (args) => handleRename(args));
  reg('folderCrud:delete', (args) => handleDelete(args));
  reg('folderCrud:addSession', (args) => handleAddSession(args));
  reg('folderCrud:removeSession', (args) => handleRemoveSession(args));
  reg('folderCrud:moveSession', (args) => handleMoveSession(args));

  registeredChannels = channels;
  return channels;
}

export function cleanupFolderCrudHandlers(): void {
  for (const ch of registeredChannels) ipcMain.removeHandler(ch);
  registeredChannels = [];
}
