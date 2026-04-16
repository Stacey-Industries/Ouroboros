/**
 * ipc-handlers/pinnedContext.ts — IPC handler registrar for pinned context (Wave 25).
 *
 * Channels:
 *   pinnedContext:add      { sessionId, item } → { success, item }
 *   pinnedContext:remove   { sessionId, itemId } → { success }
 *   pinnedContext:dismiss  { sessionId, itemId } → { success }
 *   pinnedContext:list     { sessionId, includeDismissed? } → { success, items }
 *
 * Emits pinnedContext:changed to all windows on every mutation.
 */

import type { PinnedContextItem } from '@shared/types/pinnedContext';
import { BrowserWindow, ipcMain } from 'electron';

import log from '../logger';
import { getPinnedContextStore } from '../orchestration/pinnedContextStore';

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

function broadcastChanged(sessionId: string): void {
  const store = getPinnedContextStore();
  const items = store ? store.list(sessionId, { includeDismissed: true }) : [];
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('pinnedContext:changed', { sessionId, items });
    }
  });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleAdd(args: unknown): HandlerResult<{ item: PinnedContextItem }> {
  const { sessionId, item } = (args ?? {}) as {
    sessionId?: string;
    item?: Omit<PinnedContextItem, 'id' | 'addedAt'>;
  };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  if (!item || typeof item !== 'object') return fail('item is required');
  const store = getPinnedContextStore();
  if (!store) return fail('pinnedContextStore not initialised');
  const created = store.add(sessionId, item);
  if (!created) return fail('pin cap reached — dismiss an existing pin first');
  broadcastChanged(sessionId);
  return ok({ item: created });
}

function handleRemove(args: unknown): HandlerResult<object> {
  const { sessionId, itemId } = (args ?? {}) as { sessionId?: string; itemId?: string };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  if (typeof itemId !== 'string' || !itemId) return fail('itemId is required');
  const store = getPinnedContextStore();
  if (!store) return fail('pinnedContextStore not initialised');
  store.remove(sessionId, itemId);
  broadcastChanged(sessionId);
  return ok({});
}

function handleDismiss(args: unknown): HandlerResult<object> {
  const { sessionId, itemId } = (args ?? {}) as { sessionId?: string; itemId?: string };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  if (typeof itemId !== 'string' || !itemId) return fail('itemId is required');
  const store = getPinnedContextStore();
  if (!store) return fail('pinnedContextStore not initialised');
  store.dismiss(sessionId, itemId);
  broadcastChanged(sessionId);
  return ok({});
}

function handleList(args: unknown): HandlerResult<{ items: PinnedContextItem[] }> {
  const { sessionId, includeDismissed } = (args ?? {}) as {
    sessionId?: string;
    includeDismissed?: boolean;
  };
  if (typeof sessionId !== 'string' || !sessionId) return fail('sessionId is required');
  const store = getPinnedContextStore();
  if (!store) return ok({ items: [] });
  const items = store.list(sessionId, { includeDismissed: Boolean(includeDismissed) });
  return ok({ items });
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerPinnedContextHandlers(): string[] {
  const channels: string[] = [];

  function reg(channel: string, handler: (...args: unknown[]) => unknown): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await Promise.resolve(handler(...args));
      } catch (err) {
        log.error(`[pinnedContext ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('pinnedContext:add', (args) => handleAdd(args));
  reg('pinnedContext:remove', (args) => handleRemove(args));
  reg('pinnedContext:dismiss', (args) => handleDismiss(args));
  reg('pinnedContext:list', (args) => handleList(args));

  registeredChannels = channels;
  return channels;
}

export function cleanupPinnedContextHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
