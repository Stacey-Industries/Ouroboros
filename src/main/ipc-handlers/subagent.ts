/**
 * ipc-handlers/subagent.ts — IPC handler registrar for subagent tracking.
 *
 * Channels registered:
 *   subagent:list        — list all subagent records for a parent session
 *   subagent:get         — get a single subagent record by id
 *   subagent:liveCount   — count running subagents for a parent session
 *   subagent:costRollup  — aggregated cost/token rollup for a parent session
 *   subagent:cancel      — stub cancel; marks record cancelled (Phase C wires real PTY kill)
 *
 * Push channel:
 *   subagent:updated     — broadcast to all windows on lifecycle change
 */

import { ipcMain } from 'electron';

import {
  countLive,
  get,
  listForParent,
  recordEnd,
  rollupCostForParent,
} from '../agentChat/subagentTracker';
import log from '../logger';
import { getAllActiveWindows } from '../windowManager';

// ─── Local types ──────────────────────────────────────────────────────────────

type HandlerOk<T extends object> = { success: true } & T;
type HandlerFail = { success: false; error: string };

function ok<T extends object>(data: T): HandlerOk<T> {
  return { success: true, ...data };
}

function fail(err: unknown): HandlerFail {
  return { success: false, error: err instanceof Error ? err.message : String(err) };
}

// ─── Broadcast helper ─────────────────────────────────────────────────────────

export function broadcastSubagentUpdated(parentSessionId: string): void {
  const windows = getAllActiveWindows().filter((w) => !w.isDestroyed());
  for (const win of windows) {
    try {
      win.webContents.mainFrame.send('subagent:updated', { parentSessionId });
    } catch {
      // Render frame disposed — skip
    }
  }
}

// ─── Arg types ────────────────────────────────────────────────────────────────

interface ListArgs { parentSessionId: string }
interface GetArgs { subagentId: string }
interface LiveCountArgs { parentSessionId: string }
interface CostRollupArgs { parentSessionId: string }
interface CancelArgs { subagentId: string }

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleList(args: unknown): HandlerOk<object> | HandlerFail {
  const { parentSessionId } = (args ?? {}) as ListArgs;
  if (typeof parentSessionId !== 'string' || !parentSessionId) {
    return fail('parentSessionId is required');
  }
  return ok({ records: listForParent(parentSessionId) });
}

function handleGet(args: unknown): HandlerOk<object> | HandlerFail {
  const { subagentId } = (args ?? {}) as GetArgs;
  if (typeof subagentId !== 'string' || !subagentId) {
    return fail('subagentId is required');
  }
  return ok({ record: get(subagentId) ?? null });
}

function handleLiveCount(args: unknown): HandlerOk<object> | HandlerFail {
  const { parentSessionId } = (args ?? {}) as LiveCountArgs;
  if (typeof parentSessionId !== 'string' || !parentSessionId) {
    return fail('parentSessionId is required');
  }
  return ok({ count: countLive(parentSessionId) });
}

function handleCostRollup(args: unknown): HandlerOk<object> | HandlerFail {
  const { parentSessionId } = (args ?? {}) as CostRollupArgs;
  if (typeof parentSessionId !== 'string' || !parentSessionId) {
    return fail('parentSessionId is required');
  }
  return ok({ rollup: rollupCostForParent(parentSessionId) });
}

function handleCancel(args: unknown): HandlerOk<object> | HandlerFail {
  const { subagentId } = (args ?? {}) as CancelArgs;
  if (typeof subagentId !== 'string' || !subagentId) {
    return fail('subagentId is required');
  }
  // Phase A stub: mark cancelled in the tracker.
  // Phase C will wire real PTY kill via the agent cancel mechanism.
  const rec = get(subagentId);
  if (!rec) return fail(`subagent not found: ${subagentId}`);
  if (rec.status !== 'running') return ok({});
  recordEnd(subagentId, 'cancelled');
  log.info(`[subagent:cancel] stub cancel id=${subagentId}`);
  broadcastSubagentUpdated(rec.parentSessionId);
  return ok({});
}

// ─── Registration helper ──────────────────────────────────────────────────────

function register(
  channels: string[],
  channel: string,
  handler: (args: unknown) => unknown,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, args: unknown) => {
    try {
      return await handler(args);
    } catch (err) {
      log.error(`[subagent ipc] ${channel} error:`, err);
      return fail(err);
    }
  });
  channels.push(channel);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function registerSubagentHandlers(): string[] {
  const channels: string[] = [];
  register(channels, 'subagent:list', handleList);
  register(channels, 'subagent:get', handleGet);
  register(channels, 'subagent:liveCount', handleLiveCount);
  register(channels, 'subagent:costRollup', handleCostRollup);
  register(channels, 'subagent:cancel', handleCancel);
  return channels;
}
