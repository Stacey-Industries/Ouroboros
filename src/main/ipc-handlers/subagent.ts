/**
 * ipc-handlers/subagent.ts — IPC handler registrar for subagent tracking.
 *
 * Channels registered:
 *   subagent:list        — list all subagent records for a parent session
 *   subagent:get         — get a single subagent record by id
 *   subagent:liveCount   — count running subagents for a parent session
 *   subagent:costRollup  — aggregated cost/token rollup for a parent session
 *   subagent:cancel      — cancels the subagent: real PTY kill when a ptySessionId
 *                          is bound; graceful state-only cancel otherwise.
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

async function tryKillPty(ptySessionId: string): Promise<boolean> {
  try {
    const { killPty, sessions } = await import('../pty');
    if (!sessions.has(ptySessionId)) return false;
    const result = await Promise.resolve(killPty(ptySessionId));
    return result.success;
  } catch {
    return false;
  }
}

async function handleCancel(args: unknown): Promise<HandlerOk<object> | HandlerFail> {
  const { subagentId } = (args ?? {}) as CancelArgs;
  if (typeof subagentId !== 'string' || !subagentId) {
    return fail('subagentId is required');
  }
  const rec = get(subagentId);
  if (!rec) return fail(`subagent not found: ${subagentId}`);
  // Idempotent: already terminated — treat kill of dead agent as success.
  if (rec.status !== 'running') return ok({});

  // Phase C: attempt real PTY kill when a ptySessionId is bound.
  // Race handling: if the subagent is mid-tool-call, the parent will receive
  // a tool-failure event after the kill — treated as a normal tool failure.
  if (rec.ptySessionId) {
    const killed = await tryKillPty(rec.ptySessionId);
    if (killed) {
      log.info(`[subagent:cancel] PTY killed id=${subagentId} pty=${rec.ptySessionId}`);
    } else {
      log.warn(`[subagent:cancel] PTY not found id=${subagentId} pty=${rec.ptySessionId} — state-only cancel`);
    }
  } else {
    log.info(`[subagent:cancel] no ptySessionId — state-only cancel id=${subagentId}`);
  }

  recordEnd(subagentId, 'cancelled');
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
