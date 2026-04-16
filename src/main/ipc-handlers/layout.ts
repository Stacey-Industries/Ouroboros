/**
 * ipc-handlers/layout.ts — IPC handler registrar for per-session layout persistence (Wave 28 Phase D).
 *
 * Channels:
 *   layout:getCustomLayout    (sessionId)               → { success, tree? }
 *   layout:setCustomLayout    (sessionId, tree)          → { success }
 *   layout:deleteCustomLayout (sessionId)               → { success }
 *   layout:promoteToGlobal    (name, tree)              → { success }
 *
 * Persistence capped at 100 entries (LRU via customLayoutsMru).
 * Global presets capped at 20 entries (oldest dropped).
 */

import type { SerializedGlobalCustomPreset, SerializedSlotTree } from '@shared/types/layout';
import { ipcMain } from 'electron';

import { getConfigValue, setConfigValue } from '../config';
import log from '../logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PER_SESSION = 100;
const MAX_GLOBAL_PRESETS = 20;

// ─── Response helpers ─────────────────────────────────────────────────────────

type OkResult<T extends object> = { success: true } & T;
type FailResult = { success: false; error: string };
type HandlerResult<T extends object = Record<string, never>> = OkResult<T> | FailResult;

function ok<T extends object>(data?: T): OkResult<T extends undefined ? Record<string, never> : T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { success: true, ...(data ?? {}) } as any;
}

function fail(err: unknown): FailResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: msg };
}

// ─── LRU helpers ──────────────────────────────────────────────────────────────

function touchMru(mru: string[], sessionId: string, cap: number): string[] {
  const filtered = mru.filter((id) => id !== sessionId);
  filtered.push(sessionId);
  return filtered.length > cap ? filtered.slice(filtered.length - cap) : filtered;
}

function pruneEntries(
  entries: Record<string, SerializedSlotTree>,
  mru: string[],
  cap: number,
): [Record<string, SerializedSlotTree>, string[]] {
  const ids = Object.keys(entries);
  if (ids.length <= cap) return [entries, mru];
  const next = { ...entries };
  const nextMru = [...mru];
  while (Object.keys(next).length > cap && nextMru.length > 0) {
    const oldest = nextMru.shift();
    if (oldest !== undefined) {
      // eslint-disable-next-line security/detect-object-injection
      delete next[oldest];
    }
  }
  return [next, nextMru];
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleGetCustomLayout(
  sessionId: unknown,
): HandlerResult<{ tree: SerializedSlotTree | null }> {
  if (typeof sessionId !== 'string' || !sessionId) return ok({ tree: null });
  const layout = getConfigValue('layout') ?? {};
  const entries = layout.customLayoutsPerSession ?? {};
  // eslint-disable-next-line security/detect-object-injection
  const tree = (entries as Record<string, SerializedSlotTree>)[sessionId] ?? null;
  return ok({ tree });
}

function handleSetCustomLayout(sessionId: unknown, tree: unknown): HandlerResult {
  if (typeof sessionId !== 'string' || !sessionId) return ok();
  if (tree === null || typeof tree !== 'object') return fail('tree must be an object');
  const layout = getConfigValue('layout') ?? {};
  const entries = { ...((layout.customLayoutsPerSession ?? {}) as Record<string, SerializedSlotTree>) };
  // eslint-disable-next-line security/detect-object-injection
  entries[sessionId] = tree as SerializedSlotTree;
  const mru = touchMru((layout.customLayoutsMru ?? []) as string[], sessionId, MAX_PER_SESSION);
  const [pruned, prunedMru] = pruneEntries(entries, mru, MAX_PER_SESSION);
  setConfigValue('layout', { ...layout, customLayoutsPerSession: pruned, customLayoutsMru: prunedMru });
  return ok();
}

function handleDeleteCustomLayout(sessionId: unknown): HandlerResult {
  if (typeof sessionId !== 'string' || !sessionId) return ok();
  const layout = getConfigValue('layout') ?? {};
  const entries = { ...((layout.customLayoutsPerSession ?? {}) as Record<string, SerializedSlotTree>) };
  // eslint-disable-next-line security/detect-object-injection
  delete entries[sessionId];
  const mru = ((layout.customLayoutsMru ?? []) as string[]).filter((id) => id !== sessionId);
  setConfigValue('layout', { ...layout, customLayoutsPerSession: entries, customLayoutsMru: mru });
  return ok();
}

function handlePromoteToGlobal(name: unknown, tree: unknown): HandlerResult {
  if (typeof name !== 'string' || !name) return fail('name is required');
  if (tree === null || typeof tree !== 'object') return fail('tree must be an object');
  const layout = getConfigValue('layout') ?? {};
  const presets: SerializedGlobalCustomPreset[] = [
    ...((layout.globalCustomPresets ?? []) as SerializedGlobalCustomPreset[]),
  ];
  presets.push({ name, tree: tree as SerializedSlotTree, createdAt: Date.now() });
  const capped =
    presets.length > MAX_GLOBAL_PRESETS ? presets.slice(presets.length - MAX_GLOBAL_PRESETS) : presets;
  setConfigValue('layout', { ...layout, globalCustomPresets: capped });
  return ok();
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerLayoutHandlers(): string[] {
  const channels: string[] = [];

  function reg(channel: string, handler: (...args: unknown[]) => unknown): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await Promise.resolve(handler(...args));
      } catch (err) {
        log.error(`[layout ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('layout:getCustomLayout', (sid) => handleGetCustomLayout(sid));
  reg('layout:setCustomLayout', (sid, tree) => handleSetCustomLayout(sid, tree));
  reg('layout:deleteCustomLayout', (sid) => handleDeleteCustomLayout(sid));
  reg('layout:promoteToGlobal', (name, tree) => handlePromoteToGlobal(name, tree));

  registeredChannels = channels;
  return channels;
}

export function cleanupLayoutHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
