// ---------------------------------------------------------------------------
// Warm process registry — per-thread long-lived Claude Code process manager.
//
// Key choice: `taskId` (from context.taskId in launchHeadless) is used as the
// registry key. It is stable across turns of the same chat thread because the
// chat orchestration assigns a fixed taskId per thread. A follow-up can rename
// the key if the upstream ID model changes.
// ---------------------------------------------------------------------------

import log from '../../logger';
import { spawnWarmStreamJsonProcess, type WarmSpawnOptions } from './claudeWarmStreamJsonRunner';
import type {
  StreamJsonEvent,
  StreamJsonResultEvent,
  WarmStreamJsonHandle,
} from './streamJsonTypes';

// ---- Constants -------------------------------------------------------------

// Just under Anthropic's 1 h ephemeral cache TTL to avoid stale-cache turns.
const IDLE_KILL_MS = 55 * 60 * 1000;

// ---- Registry entry --------------------------------------------------------

interface WarmEntry {
  handle: WarmStreamJsonHandle;
  idleTimer: ReturnType<typeof setTimeout>;
  lastUsedAt: number;
  key: string;
}

const warmProcesses = new Map<string, WarmEntry>();

// ---- Internal helpers ------------------------------------------------------

function cancelIdleTimer(entry: WarmEntry): void {
  clearTimeout(entry.idleTimer);
}

function scheduleIdleKill(key: string, entry: WarmEntry): void {
  entry.idleTimer = setTimeout(() => {
    killWarm(key, 'idle');
  }, IDLE_KILL_MS);
}

function restartIdleTimer(key: string): void {
  const entry = warmProcesses.get(key);
  if (!entry) return;
  cancelIdleTimer(entry);
  scheduleIdleKill(key, entry);
  entry.lastUsedAt = Date.now();
}

function spawnAndRegister(key: string, spawnOptions: WarmSpawnOptions): WarmStreamJsonHandle {
  const handle = spawnWarmStreamJsonProcess({
    ...spawnOptions,
    onExit: () => {
      const entry = warmProcesses.get(key);
      if (entry) {
        cancelIdleTimer(entry);
        warmProcesses.delete(key);
        log.info(`[warm:${key}] process exited — removed from registry`);
      }
    },
  });
  const entry: WarmEntry = {
    handle,
    idleTimer: setTimeout(() => {}, 0), // placeholder replaced immediately
    lastUsedAt: Date.now(),
    key,
  };
  clearTimeout(entry.idleTimer);
  scheduleIdleKill(key, entry);
  warmProcesses.set(key, entry);
  log.info(`[warm:${key}] spawned warm process pid=${handle.pid}`);
  return handle;
}

// ---- Public API ------------------------------------------------------------

export function getOrCreateWarm(key: string, spawnOptions: WarmSpawnOptions): WarmStreamJsonHandle {
  const existing = warmProcesses.get(key);
  if (existing) return existing.handle;
  return spawnAndRegister(key, spawnOptions);
}

export async function sendWarmTurn(
  key: string,
  content: string,
  onEvent: (event: StreamJsonEvent) => void,
): Promise<StreamJsonResultEvent> {
  const entry = warmProcesses.get(key);
  if (!entry) throw new Error(`[warm] no warm process for key: ${key}`);
  restartIdleTimer(key);
  return entry.handle.sendTurn(content, onEvent);
}

export function injectWarmUserMessage(key: string, content: string): void {
  const entry = warmProcesses.get(key);
  if (!entry) {
    log.warn(`[warm:${key}] injectWarmUserMessage: no warm process found`);
    return;
  }
  restartIdleTimer(key);
  entry.handle.injectUserMessage(content);
}

export function killWarm(key: string, reason: string): void {
  const entry = warmProcesses.get(key);
  if (!entry) return;
  cancelIdleTimer(entry);
  warmProcesses.delete(key);
  entry.handle.kill();
  log.info(`[warm:${key}] killed — reason: ${reason}`);
}

export function killAllWarm(): void {
  for (const key of [...warmProcesses.keys()]) {
    killWarm(key, 'killAll');
  }
}

export function warmProcessCount(): number {
  return warmProcesses.size;
}
