/**
 * bootstrap.ts — Must be imported as the very first module in main.ts.
 *
 * Sets UV_THREADPOOL_SIZE before any libuv consumer loads (electron, node-pty,
 * fs, better-sqlite3). Node's default pool of 4 threads queues concurrent
 * fs.readFile calls; the codebase indexer relies on ~16 threads being available.
 *
 * We respect a user-supplied value already in the environment and only set the
 * variable when it has not been provided. electron-log is NOT safe to import
 * this early, so we use console.warn for startup visibility.
 */

import os from 'os';

const MIN_THREADS = 16;
const MAX_THREADS = 32;

if (!process.env['UV_THREADPOOL_SIZE']) {
  const cpuBased = os.cpus().length * 2;
  const chosen = Math.min(Math.max(cpuBased, MIN_THREADS), MAX_THREADS);
  process.env['UV_THREADPOOL_SIZE'] = String(chosen);
  // eslint-disable-next-line no-console
  console.warn('[bootstrap] UV_THREADPOOL_SIZE set to', chosen);
} else {
  // eslint-disable-next-line no-console
  console.warn('[bootstrap] UV_THREADPOOL_SIZE already set to', process.env['UV_THREADPOOL_SIZE']);
}
