/**
 * ipc-handlers/sessionCrud.ts — IPC handler registrar for session store CRUD.
 *
 * Channels:
 *   sessionCrud:list     — all sessions from sessionStore
 *   sessionCrud:active   — current window's active session id
 *   sessionCrud:create   — create + upsert + return new session
 *   sessionCrud:activate — set activeSessionId for a window
 *   sessionCrud:archive  — archive session by id (writes trash file)
 *   sessionCrud:restore  — restore archived session from trash
 *   sessionCrud:delete   — delete a session by id
 *
 * Emits sessionCrud:changed to all renderer windows on every mutation.
 *
 * NOTE: Channels are namespaced sessionCrud:* (not sessions:*) to avoid
 * colliding with the file-persistence channels in ipc-handlers/sessions.ts.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import log from '../logger';
import { applyToSession } from '../orchestration/workspaceReadList';
import type { AgentMonitorSettings, Session } from '../session/session';
import { makeSession } from '../session/session';
import { getSessionStore } from '../session/sessionStore';
import { restoreFromTrash, writeToTrash } from '../session/sessionTrash';
import { createChatWindow } from '../windowManager';
import { getRegisteredMcpServerIds } from './mcp';

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
  applyToSession(session.id, projectRoot);
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

async function handleArchive(args: unknown): Promise<HandlerResult<object>> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  store.archive(sessionId);
  const archived = store.getById(sessionId);
  if (archived) await writeToTrash(archived);
  broadcastChanged();
  return ok({});
}

async function handleRestore(args: unknown): Promise<HandlerResult<object>> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  const restored = await restoreFromTrash(sessionId, (s) => store.upsert(s));
  if (!restored) return fail(`no trash file found for session: ${sessionId}`);
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

function handleUpdateAgentMonitorSettings(args: unknown): HandlerResult<object> {
  const { sessionId, settings } = (args ?? {}) as {
    sessionId?: string;
    settings?: AgentMonitorSettings;
  };
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  if (!settings || typeof settings !== 'object') {
    return fail('settings is required');
  }
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  const session = store.getById(sessionId);
  if (!session) return fail(`session not found: ${sessionId}`);
  store.upsert({ ...session, agentMonitorSettings: settings });
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

function handlePin(args: unknown): HandlerResult<object> {
  const { sessionId, pinned } = (args ?? {}) as { sessionId?: string; pinned?: boolean };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  store.pin(sessionId, Boolean(pinned));
  broadcastChanged();
  return ok({});
}

function handleSoftDelete(args: unknown): HandlerResult<object> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  store.softDelete(sessionId);
  broadcastChanged();
  return ok({});
}

function handleRestoreDeleted(args: unknown): HandlerResult<object> {
  const { sessionId } = (args ?? {}) as { sessionId?: string };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  store.restoreDeleted(sessionId);
  broadcastChanged();
  return ok({});
}

function handleSetProfile(args: unknown): HandlerResult<object> {
  const { sessionId, profileId } = (args ?? {}) as { sessionId?: string; profileId?: string };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  if (typeof profileId !== 'string' || !profileId) return fail('profileId is required');
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  const session = store.getById(sessionId);
  if (!session) return fail(`session not found: ${sessionId}`);
  store.upsert({ ...session, profileId });
  broadcastChanged();
  return ok({});
}

function handleSetToolOverrides(args: unknown): HandlerResult<object> {
  const { sessionId, toolOverrides } = (args ?? {}) as {
    sessionId?: string;
    toolOverrides?: string[];
  };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  if (!Array.isArray(toolOverrides)) return fail('toolOverrides must be an array');
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  const session = store.getById(sessionId);
  if (!session) return fail(`session not found: ${sessionId}`);
  store.upsert({ ...session, toolOverrides });
  broadcastChanged();
  return ok({});
}

async function handleSetMcpOverrides(
  args: unknown,
): Promise<HandlerResult<object> | { success: false; error: string; unknownIds: string[] }> {
  const { sessionId, mcpServerOverrides } = (args ?? {}) as {
    sessionId?: string;
    mcpServerOverrides?: string[];
  };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  if (!Array.isArray(mcpServerOverrides)) return fail('mcpServerOverrides must be an array');
  const store = getSessionStore();
  if (!store) return fail('sessionStore not initialised');
  const session = store.getById(sessionId);
  if (!session) return fail(`session not found: ${sessionId}`);

  // Validate every supplied server ID against the registered MCP server list
  const registeredIds = await getRegisteredMcpServerIds(session.projectRoot);
  const unknownIds = mcpServerOverrides.filter((id) => !registeredIds.includes(id));
  if (unknownIds.length > 0) {
    log.warn('[sessionCrud] setMcpOverrides rejected unknown server IDs:', unknownIds.length);
    return { success: false, error: 'unknown-mcp-server', unknownIds };
  }

  store.upsert({ ...session, mcpServerOverrides });
  broadcastChanged();
  return ok({});
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
  reg('sessionCrud:restore', (_e, args) => handleRestore(args));
  reg('sessionCrud:delete', (_e, args) => handleDelete(args));
  reg('sessionCrud:openChatWindow', (_e, args) => handleOpenChatWindow(args));
  reg('sessionCrud:updateAgentMonitorSettings', (_e, args) =>
    handleUpdateAgentMonitorSettings(args),
  );
  reg('sessionCrud:pin', (_e, args) => handlePin(args));
  reg('sessionCrud:softDelete', (_e, args) => handleSoftDelete(args));
  reg('sessionCrud:restoreDeleted', (_e, args) => handleRestoreDeleted(args));
  reg('sessionCrud:setProfile', (_e, args) => handleSetProfile(args));
  reg('sessionCrud:setToolOverrides', (_e, args) => handleSetToolOverrides(args));
  reg('sessionCrud:setMcpOverrides', (_e, args) => handleSetMcpOverrides(args));

  registeredChannels = channels;
  return channels;
}

export function cleanupSessionCrudHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
