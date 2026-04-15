/**
 * ipc-handlers/sessionCrud.ts — IPC handler registrar for session store CRUD.
 *
 * Channels:
 *   sessionCrud:list     — all sessions from sessionStore
 *   sessionCrud:active   — current window's active session id
 *   sessionCrud:create   — create + upsert + return new session
 *   sessionCrud:activate — set activeSessionId for a window
 *   sessionCrud:archive  — archive a session by id
 *   sessionCrud:delete   — delete a session by id
 *
 * Emits sessionCrud:changed to all renderer windows on every mutation.
 *
 * NOTE: Channels are namespaced sessionCrud:* (not sessions:*) to avoid
 * colliding with the file-persistence channels in ipc-handlers/sessions.ts.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import log from '../logger';
import type { Session } from '../session/session';
import { makeSession } from '../session/session';
import { getSessionStore } from '../session/sessionStore';
import { createChatWindow } from '../windowManager';

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

// ─── Broadcast helpers ────────────────────────────────────────────────────────

function broadcastChanged(): void {
  const sessions = getSessionStore()?.listAll() ?? [];
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('sessionCrud:changed', sessions);
    }
  });
}

// ─── Per-window active session state ─────────────────────────────────────────

const activeSessionByWindow = new Map<number, string>();

function getWindowId(event: IpcMainInvokeEvent): number {
  return BrowserWindow.fromWebContents(event.sender)?.id ?? -1;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function handleList(): HandlerResult<{ sessions: Session[] }> {
  const store = getSessionStore();
  if (!store) return ok({ sessions: [] });
  return ok({ sessions: store.listAll() });
}

function handleActive(event: IpcMainInvokeEvent): HandlerResult<{ sessionId: string | null }> {
  const winId = getWindowId(event);
  const sessionId = activeSessionByWindow.get(winId) ?? null;
  return ok({ sessionId });
}

function handleCreate(args: unknown): HandlerResult<{ session: Session }> {
  const { projectRoot } = (args ?? {}) as { projectRoot?: string };
  if (typeof projectRoot !== 'string' || !projectRoot) {
    return fail('projectRoot is required');
  }
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  const session = makeSession(projectRoot);
  store.upsert(session);
  broadcastChanged();
  return ok({ session });
}

function handleActivate(event: IpcMainInvokeEvent, args: unknown): HandlerResult<object> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  const winId = getWindowId(event);
  activeSessionByWindow.set(winId, sessionId);
  return ok({});
}

function handleArchive(args: unknown): HandlerResult<object> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  store.archive(sessionId);
  broadcastChanged();
  return ok({});
}

function handleDelete(args: unknown): HandlerResult<object> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  store.delete(sessionId);
  broadcastChanged();
  return ok({});
}

function handleOpenChatWindow(args: unknown): HandlerResult<{ windowId: number }> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  const win = createChatWindow(sessionId);
  return ok({ windowId: win.id });
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerSessionCrudHandlers(): string[] {
  const channels: string[] = [];

  function reg(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await Promise.resolve(handler(event, ...args));
      } catch (err) {
        log.error(`[sessionCrud ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('sessionCrud:list', handleList);
  reg('sessionCrud:active', handleActive);
  reg('sessionCrud:create', (_e, args) => handleCreate(args));
  reg('sessionCrud:activate', (e, args) => handleActivate(e, args));
  reg('sessionCrud:archive', (_e, args) => handleArchive(args));
  reg('sessionCrud:delete', (_e, args) => handleDelete(args));
  reg('sessionCrud:openChatWindow', (_e, args) => handleOpenChatWindow(args));

  registeredChannels = channels;
  return channels;
}

export function cleanupSessionCrudHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
