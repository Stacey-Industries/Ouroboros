/**
 * logger.ts — Centralized structured logging via electron-log.
 *
 * Worker-safe: detects worker_threads context and falls back to console
 * because electron-log requires the 'electron' module (unavailable in workers).
 *
 * Usage:
 *   import log from './logger';
 *   log.info('Server started', { port: 3000 });
 *   log.error('Failed to read config', error);
 *
 * In production, logs are written to:
 *   - Windows: %USERPROFILE%\AppData\Roaming\Ouroboros\logs\
 *   - macOS:   ~/Library/Logs/Ouroboros/
 *   - Linux:   ~/.config/Ouroboros/logs/
 */

import { isMainThread } from 'worker_threads';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let log: any;

if (isMainThread) {
  // electron-log requires 'electron' — only available in the main Electron process
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronLog = require('electron-log/main');
  electronLog.transports.file.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  electronLog.transports.console.level = process.env.NODE_ENV === 'development' ? 'info' : 'warn';
  electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  electronLog.transports.file.maxSize = 5 * 1024 * 1024;
  // Use async writes to avoid EMFILE — default sync mode opens/closes the file
  // on every log line, exhausting the process FD limit during heavy startup.
  electronLog.transports.file.getFile().writeAsync = true;
  // Register IPC listener so electron-log/renderer can forward logs to main.
  electronLog.initialize();
  log = electronLog;
} else {
  // Worker threads: console fallback (electron module unavailable)
  // Map all levels to console.warn/error (the only methods allowed by no-console rule)
  log = {
    info: console.warn.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.warn.bind(console),
    verbose: console.warn.bind(console),
    log: console.warn.bind(console),
  };
}

export default log;

/** Returns the path to the log file directory for use in "Open Logs Folder" */
export function getLogPath(): string {
  if (!isMainThread) return '';
  return log.transports.file.getFile().path;
}
