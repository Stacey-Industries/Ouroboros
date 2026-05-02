/**
 * telemetryJsonlMirror.ts — Wave 70 Phase C2 cold-tier archive for telemetry.
 *
 * SQLite stays the hot tier (30-day retention via `purgeRetainedRows`). This
 * module dual-writes every telemetry event to JSONL files for permanent
 * archival, alongside SQLite. The user's stated requirement: historical
 * telemetry preserved indefinitely, not purged.
 *
 * Design (mirrors `routerLogger.ts` rotation pattern):
 *   - One JSON line per event, written via `fs.writeSync` (sync, low overhead).
 *   - Daily file: `events-YYYY-MM-DD.jsonl`.
 *   - Rotates when file exceeds 10 MB → renamed to `.bak` + fresh fd.
 *   - Daily gzip task (Phase C4) compresses files older than 1 day to
 *     `<basename>.jsonl.gz` (~10× smaller).
 *   - Default retention: disabled (10-year ceiling as defensive cap).
 *
 * Wave 41 Phase F deleted the original `telemetryJsonlMirror.ts` because no
 * production caller existed. Wave 70 revives it with retention disabled, so
 * the SQLite 30-day purge becomes pure cache eviction — no data loss.
 *
 * Disk volume: ~50 MB/year compressed (~500 MB/decade). Negligible on modern
 * hardware; line-level append-only atomicity protects against crash mid-write.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

import log from '../logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
/** 10 years — defensive ceiling; effectively "permanent archive". */
const DEFAULT_RETENTION_DAYS = 3650;
/** Files older than this become eligible for gzip compression. */
const GZIP_AGE_MS = 24 * 60 * 60 * 1000;
/** Daily compression interval. */
const GZIP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

interface MirrorState {
  dir: string;
  filePath: string;
  fd: number | null;
  gzipHandle: ReturnType<typeof setInterval> | null;
}

function openFd(filePath: string): number {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- caller-supplied trusted path under app.getPath('userData')
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
  const expectedPath = path.join(state.dir, currentFilename());
  const dateChanged = state.filePath !== expectedPath;
  const tooBig = currentFileSize(state.filePath) > MAX_BYTES;
  if (!dateChanged && !tooBig) return;

  if (state.fd !== null) {
    try {
      fs.closeSync(state.fd);
    } catch {
      /* already closed */
    }
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
  /** Manually trigger the gzip pass (also runs on a daily setInterval). */
  compressOldFiles(): number;
  close(): void;
}

export interface TelemetryJsonlMirrorOptions {
  /** Defaults to 3650 (≈ "forever"). Set lower to enable purge. */
  retentionDays?: number;
  /** Defaults to true. Set false to skip the daily gzip task. */
  enableGzipTask?: boolean;
}

function appendEventInto(state: MirrorState, event: unknown): void {
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
}

function closeMirrorState(state: MirrorState): void {
  if (state.gzipHandle !== null) {
    clearInterval(state.gzipHandle);
    state.gzipHandle = null;
  }
  if (state.fd !== null) {
    try {
      fs.closeSync(state.fd);
    } catch {
      /* already closed */
    }
    state.fd = null;
  }
}

function startGzipTask(state: MirrorState, telemetryDir: string): void {
  state.gzipHandle = setInterval(() => {
    try {
      compressOldFiles(telemetryDir);
    } catch (err) {
      log.warn('[telemetry-mirror] gzip task error', err);
    }
  }, GZIP_INTERVAL_MS);
  if (
    typeof state.gzipHandle === 'object' &&
    state.gzipHandle !== null &&
    'unref' in state.gzipHandle
  ) {
    (state.gzipHandle as NodeJS.Timeout).unref();
  }
}

export function createTelemetryJsonlMirror(
  telemetryDir: string,
  opts: TelemetryJsonlMirrorOptions = {},
): TelemetryJsonlMirror {
  ensureDir(telemetryDir);
  const state: MirrorState = {
    dir: telemetryDir,
    filePath: path.join(telemetryDir, currentFilename()),
    fd: null,
    gzipHandle: null,
  };
  const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
  if (opts.enableGzipTask ?? true) startGzipTask(state, telemetryDir);

  return {
    appendEvent: (event) => appendEventInto(state, event),
    purgeOldFiles: (days) => purgeOldFiles(telemetryDir, days ?? retentionDays),
    compressOldFiles: () => compressOldFiles(telemetryDir),
    close: () => closeMirrorState(state),
  };
}

// ─── Standalone purge / gzip (also exported for tests / scheduled GC) ────────

/** Match `events-YYYY-MM-DD.jsonl` and `.bak` siblings. */
function isJsonlEventFile(name: string): boolean {
  return /^events-\d{4}-\d{2}-\d{2}\.jsonl(?:\.bak)?$/.test(name);
}

function isJsonlEventGz(name: string): boolean {
  return /^events-\d{4}-\d{2}-\d{2}\.jsonl(?:\.bak)?\.gz$/.test(name);
}

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
    if (!isJsonlEventFile(entry.name) && !isJsonlEventGz(entry.name)) continue;
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

/** Today's basename — we never compress today's live file. */
function todayBasename(): string {
  return currentFilename();
}

export function compressOldFiles(dir: string): number {
  const todayName = todayBasename();
  let compressed = 0;
  let entries: fs.Dirent[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isJsonlEventFile(entry.name)) continue;
    if (entry.name === todayName) continue;
    const fullPath = path.join(dir, entry.name);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
      const stat = fs.statSync(fullPath);
      if (Date.now() - stat.mtimeMs < GZIP_AGE_MS) continue;
      void compressOne(fullPath);
      compressed++;
    } catch {
      // skip
    }
  }
  return compressed;
}

async function compressOne(fullPath: string): Promise<void> {
  const gzPath = `${fullPath}.gz`;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    if (fs.existsSync(gzPath)) return;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    const src = fs.createReadStream(fullPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    const dst = fs.createWriteStream(gzPath);
    await pipeline(src, zlib.createGzip(), dst);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
    fs.unlinkSync(fullPath);
  } catch (err) {
    log.warn('[telemetry-mirror] compress error', err);
  }
}
