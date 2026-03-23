/**
 * logger.ts — Centralized structured logging via electron-log.
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

import electronLog from 'electron-log/main';

// Configure log levels per environment
electronLog.transports.file.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
electronLog.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';

// Format: [timestamp] [level] message
electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Rotate logs: max 5MB per file, keep 3 old files
electronLog.transports.file.maxSize = 5 * 1024 * 1024;

const log = electronLog;

export default log;

/** Returns the path to the log file directory for use in "Open Logs Folder" */
export function getLogPath(): string {
  return electronLog.transports.file.getFile().path;
}
