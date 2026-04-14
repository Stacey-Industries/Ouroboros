/**
 * perfHandlers.ts — IPC handlers for performance metrics channels.
 *
 * Registers perf:ping, perf:subscribe, perf:unsubscribe, perf:markFirstRender,
 * perf:getStartupTimings, and perf:getRuntimeMetrics.
 */

import { ipcMain } from 'electron';

import log from '../logger';
import {
  formatStartupSummary,
  getLatestPerfMetrics,
  getStartupTimings,
  markStartup,
  subscribeToPerfMetrics,
  unsubscribeFromPerfMetrics,
} from '../perfMetrics';
import { appendStartupRecord, readRecentStartups } from '../perfStartupLog';

type ChannelList = string[];

const MAX_HISTORY_LIMIT = 100;
const DEFAULT_HISTORY_LIMIT = 20;

function registerChannel(channels: ChannelList, channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

function ok(): { success: true };
function ok<T extends object>(payload: T): { success: true } & T;
function ok(payload?: object) {
  return payload ? { success: true, ...payload } : { success: true };
}

function handleFirstRender(): { success: true } {
  markStartup('first-render');
  const summary = formatStartupSummary();
  if (summary) log.info('[perf] startup:', summary);
  appendStartupRecord(getStartupTimings());
  return ok();
}

async function handleGetStartupHistory(
  _event: Electron.IpcMainInvokeEvent,
  args: { limit?: number } = {},
): Promise<{ success: true; records: Awaited<ReturnType<typeof readRecentStartups>> }> {
  const limit = Math.min(args.limit ?? DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
  const records = await readRecentStartups(limit);
  return ok({ records });
}

export function registerPerfHandlers(channels: ChannelList): void {
  registerChannel(channels, 'perf:ping', () => ok({ ts: Date.now() }));
  registerChannel(channels, 'perf:subscribe', (event) => subscribeToPerfMetrics(event));
  registerChannel(channels, 'perf:unsubscribe', (event) => unsubscribeFromPerfMetrics(event));
  registerChannel(channels, 'perf:markFirstRender', handleFirstRender);
  registerChannel(channels, 'perf:getStartupTimings', () => ok({ timings: getStartupTimings() }));
  registerChannel(channels, 'perf:getRuntimeMetrics', () => ok({ metrics: getLatestPerfMetrics() }));
  registerChannel(channels, 'perf:getStartupHistory', handleGetStartupHistory);
}
