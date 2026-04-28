/**
 * queueRotation.ts — Wave 52 Phase B
 *
 * Size-cap policy for the telemetry parity queue.
 *
 * Two caps:
 *   - PER_FILE_CAP_BYTES (10 MB): once a `<surface>.jsonl` exceeds this, the
 *     append helper renames it to `<surface>.jsonl.<n>` and starts fresh.
 *     `shouldRollFile()` is the readable gate; the actual rename lives in
 *     telemetryQueue.ts so rotation stays in the write path.
 *   - TOTAL_DIR_CAP_BYTES (100 MB): the queue dir as a whole is capped.
 *     `enforceTotalDirCap()` is invoked once at startup, before drain runs;
 *     if total > cap, oldest files (by mtime) are deleted until under.
 *
 * Pure file-listing + delete; no parsing, no SQL.
 */

import fs from 'node:fs';
import path from 'node:path';

import log from '../logger';

export const PER_FILE_CAP_BYTES = 10 * 1024 * 1024;
export const TOTAL_DIR_CAP_BYTES = 100 * 1024 * 1024;

export interface DirCapResult {
  dropped: string[];
}

/** Returns true if the file exists and exceeds the per-file cap. */
export function shouldRollFile(filePath: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- queue path under user home
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size >= PER_FILE_CAP_BYTES;
  } catch {
    return false;
  }
}

interface QueueFileStat {
  name: string;
  fullPath: string;
  size: number;
  mtimeMs: number;
}

function listQueueFiles(queueDir: string): QueueFileStat[] {
  let entries: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- queue dir under user home
    entries = fs.readdirSync(queueDir);
  } catch {
    return [];
  }
  const files: QueueFileStat[] = [];
  for (const name of entries) {
    const fullPath = path.join(queueDir, name);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- queue path under user home
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      files.push({ name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // Skip unreadable entries; log only at debug to avoid noise on cold boot.
    }
  }
  return files;
}

/**
 * Enforces the total directory cap by deleting oldest-mtime files until
 * the remaining total is at or below the cap. Returns the names of dropped
 * files for caller-side logging.
 *
 * Deletion is best-effort; a failed unlink is logged and the file remains
 * counted for the next pass.
 */
export function enforceTotalDirCap(queueDir: string): DirCapResult {
  const dropped: string[] = [];
  const files = listQueueFiles(queueDir);
  let total = files.reduce((sum, f) => sum + f.size, 0);
  if (total <= TOTAL_DIR_CAP_BYTES) return { dropped };
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of files) {
    if (total <= TOTAL_DIR_CAP_BYTES) break;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- queue path under user home
      fs.unlinkSync(file.fullPath);
      dropped.push(file.name);
      total -= file.size;
    } catch (err) {
      log.warn('[telemetry-queue] cap unlink failed:', file.name, err);
    }
  }
  return { dropped };
}
