/**
 * telemetryQueue.ts — Wave 52 Phase B
 *
 * IDE-side append helper for the telemetry parity queue. Records are written
 * to `~/.ouroboros/telemetry/queue/<surface>.jsonl`, one JSON object per line.
 *
 * The drain side (telemetryDrain.ts) atomically moves these files into
 * `processed/` before parsing, so writers never need to coordinate with
 * readers — append is safe even mid-drain.
 *
 * Wire format (MUST stay byte-compatible with assets/hooks/lib/telemetryQueueAppend.mjs):
 *   {
 *     "recordId":      string  (UUID v4, generated per record),
 *     "ts":            number  (ms since epoch),
 *     "surface":       string  (sink name; routes to handler),
 *     "schemaVersion": number  (per-surface; drain skips unknown),
 *     "payload":       T       (surface-specific record body)
 *   }
 *
 * Pure write — never imports from telemetryStore or any sink. Tolerates fs
 * errors silently (logs at warn). Caps file size via queueRotation.shouldRollFile;
 * total-dir-cap enforcement happens at startup, not per-append.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import log from '../logger';
import { PER_FILE_CAP_BYTES, shouldRollFile } from './queueRotation';

export interface QueueRecord<T = unknown> {
  recordId: string;
  ts: number;
  surface: string;
  schemaVersion: number;
  payload: T;
}

/** Resolves `~/.ouroboros/telemetry/queue`. Same path the hook helper uses. */
export function getQueueDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '.';
  return path.join(home, '.ouroboros', 'telemetry', 'queue');
}

function ensureDir(dir: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry dir under user home
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    log.warn('[telemetry-queue] mkdir failed:', err);
    return false;
  }
}

/** Sanitize surface name to a safe basename. Defensive: surfaces are constants in code. */
function safeSurface(surface: string): string {
  // Replace path separators and other unsafe chars with `_`, then collapse
  // leading dots so a malicious surface like `../etc` cannot escape the queue dir.
  return surface.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_');
}

function nextRolloverPath(filePath: string): string {
  // Find first <file>.<n> that doesn't exist; cap at 1000 to prevent runaway.
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${filePath}.${n}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- queue path under user home
    if (!fs.existsSync(candidate)) return candidate;
  }
  return `${filePath}.${Date.now()}`;
}

function rotateIfNeeded(filePath: string): void {
  if (!shouldRollFile(filePath)) return;
  try {
    const target = nextRolloverPath(filePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- queue path under user home
    fs.renameSync(filePath, target);
  } catch (err) {
    log.warn('[telemetry-queue] rotation failed:', err);
  }
}

/**
 * Append one telemetry record to the queue. Never throws.
 *
 * Synchronous to keep callers a single line; the writes are tiny.
 */
export function appendToQueue<T>(surface: string, schemaVersion: number, payload: T): void {
  const dir = getQueueDir();
  if (!ensureDir(dir)) return;
  const filePath = path.join(dir, `${safeSurface(surface)}.jsonl`);
  rotateIfNeeded(filePath);
  const record: QueueRecord<T> = {
    recordId: crypto.randomUUID(),
    ts: Date.now(),
    surface,
    schemaVersion,
    payload,
  };
  const line = JSON.stringify(record) + '\n';
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- queue path under user home
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err) {
    log.warn('[telemetry-queue] append failed:', err);
  }
}

export { PER_FILE_CAP_BYTES };
