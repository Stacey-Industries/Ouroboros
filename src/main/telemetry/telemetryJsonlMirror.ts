/**
 * telemetryJsonlMirror.ts — Daily-rotated JSONL writer for telemetry events.
 *
 * Follows the routerLogger.ts rotation pattern exactly:
 *   - One JSON line per event via fs.writeSync (sync, low-overhead)
 *   - Daily file: events-YYYY-MM-DD.jsonl
 *   - Rotates when file exceeds 10 MB (rename to .bak, open fresh)
 *   - purgeOldFiles(dir, retentionDays) removes stale rotated files
 */

import fs from 'node:fs';
import path from 'node:path';

import log from '../logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_RETENTION_DAYS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDateStamp(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function currentFilename(): string {
  return `events-${isoDateStamp()}.jsonl`;
}

function bakPath(filePath: string): string {
  return `${filePath}.bak`;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface MirrorState {
  dir: string;
  filePath: string;
  fd: number | null;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function openFd(filePath: string): number {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from app.getPath('userData'), a trusted internal path
  return fs.openSync(filePath, 'a');
}

function ensureDir(dir: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
  if (!fs.existsSync(dir)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    fs.mkdirSync(dir, { recursive: true });
  }
}

function currentFileSize(filePath: string): number {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function rotateIfNeeded(state: MirrorState): void {
  // Also rotate when the date changes (daily rotation).
  const expectedPath = path.join(state.dir, currentFilename());
  const dateChanged = state.filePath !== expectedPath;
  const tooBig = currentFileSize(state.filePath) > MAX_BYTES;

  if (!dateChanged && !tooBig) return;

  if (state.fd !== null) {
    fs.closeSync(state.fd);
    state.fd = null;
  }

  if (tooBig) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
      fs.renameSync(state.filePath, bakPath(state.filePath));
    } catch {
      // File may not exist yet — safe to ignore
    }
  }

  state.filePath = expectedPath;
  state.fd = openFd(state.filePath);
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface TelemetryJsonlMirror {
  appendEvent(event: unknown): void;
  purgeOldFiles(retentionDays?: number): number;
  close(): void;
}

export function createTelemetryJsonlMirror(telemetryDir: string): TelemetryJsonlMirror {
  ensureDir(telemetryDir);

  const state: MirrorState = {
    dir: telemetryDir,
    filePath: path.join(telemetryDir, currentFilename()),
    fd: null,
  };

  return {
    appendEvent(event: unknown): void {
      try {
        rotateIfNeeded(state);
        if (state.fd === null) {
          state.fd = openFd(state.filePath);
        }
        const line = JSON.stringify(event) + '\n';
        fs.writeSync(state.fd, line, undefined, 'utf8');
      } catch (err) {
        log.error('[telemetry-mirror] appendEvent error', err);
      }
    },

    purgeOldFiles(retentionDays = DEFAULT_RETENTION_DAYS): number {
      return purgeOldFiles(telemetryDir, retentionDays);
    },

    close(): void {
      if (state.fd !== null) {
        try {
          fs.closeSync(state.fd);
        } catch {
          // Already closed
        }
        state.fd = null;
      }
    },
  };
}

// ─── Standalone purge (also exported for tests / scheduled GC) ───────────────

export function purgeOldFiles(dir: string, retentionDays = DEFAULT_RETENTION_DAYS): number {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let entries: fs.Dirent[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('events-') || !entry.name.endsWith('.jsonl')) continue;
    const fullPath = path.join(dir, entry.name);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
      const mtime = fs.statSync(fullPath).mtimeMs;
      if (mtime < cutoffMs) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        fs.unlinkSync(fullPath);
        deleted++;
      }
    } catch {
      // Skip files we can't stat or delete
    }
  }
  return deleted;
}
