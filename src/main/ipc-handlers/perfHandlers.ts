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
import { appendStartupRecord } from '../perfStartupLog';

type ChannelList = string[];

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

export function registerPerfHandlers(channels: ChannelList): void {
  registerChannel(channels, 'perf:ping', () => ok({ ts: Date.now() }));
  registerChannel(channels, 'perf:subscribe', (event) => subscribeToPerfMetrics(event));
  registerChannel(channels, 'perf:unsubscribe', (event) => unsubscribeFromPerfMetrics(event));
  registerChannel(channels, 'perf:markFirstRender', handleFirstRender);
  registerChannel(channels, 'perf:getStartupTimings', () => ok({ timings: getStartupTimings() }));
  registerChannel(channels, 'perf:getRuntimeMetrics', () => ok({ metrics: getLatestPerfMetrics() }));
}
