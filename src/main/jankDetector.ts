/**
 * jankDetector.ts — Event loop jank monitor for the main process.
 *
 * Uses a high-frequency timer to detect when the main thread is blocked.
 * When a tick arrives late by more than JANK_THRESHOLD_MS, the event loop
 * was stalled — log the duration so we can correlate with other activity.
 */

import v8 from 'node:v8';

import log from './logger';

// ─── Config ─────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 200;
const JANK_THRESHOLD_MS = 150;
const HEAP_LOG_INTERVAL_MS = 60_000;

// ─── State ──────────────────────────────────────────────────────────────

let timerId: ReturnType<typeof setInterval> | null = null;
let lastTickAt = 0;
let lastHeapLogAt = 0;
let jankCount = 0;

// ─── Helpers ────────────────────────────────────────────────────────────

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function logHeapSnapshot(): void {
  const heap = v8.getHeapStatistics();
  log.info(
    `[jank] heap: used=${formatMB(heap.used_heap_size)}` +
      ` total=${formatMB(heap.total_heap_size)}` +
      ` limit=${formatMB(heap.heap_size_limit)}` +
      ` external=${formatMB(heap.external_memory)}`,
  );
}

function onTick(): void {
  const now = Date.now();
  const elapsed = now - lastTickAt;
  const jank = elapsed - CHECK_INTERVAL_MS;
  lastTickAt = now;

  if (jank > JANK_THRESHOLD_MS) {
    jankCount++;
    log.warn(
      `[jank] event loop blocked for ~${jank}ms` +
        ` (tick expected after ${CHECK_INTERVAL_MS}ms, arrived after ${elapsed}ms)` +
        ` — total janks this session: ${jankCount}`,
    );
    logHeapSnapshot();
  }

  if (now - lastHeapLogAt > HEAP_LOG_INTERVAL_MS) {
    lastHeapLogAt = now;
    logHeapSnapshot();
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

export function startJankDetector(): void {
  if (timerId) return;
  lastTickAt = Date.now();
  lastHeapLogAt = Date.now();
  timerId = setInterval(onTick, CHECK_INTERVAL_MS);
  // Prevent the interval from keeping the process alive during shutdown
  if (timerId && typeof timerId === 'object' && 'unref' in timerId) {
    timerId.unref();
  }
  log.info('[jank] detector started');
  logHeapSnapshot();
}

export function stopJankDetector(): void {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
  log.info(`[jank] detector stopped — total janks: ${jankCount}`);
}
