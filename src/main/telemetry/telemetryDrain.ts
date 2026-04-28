/**
 * telemetryDrain.ts — Wave 52 Phase B
 *
 * Startup-time pipe that imports queued telemetry written by external
 * sessions while the IDE was offline.
 *
 * Lifecycle per file:
 *   1. Atomic move queue/<file> → processed/<file> (rename is the commit point).
 *   2. Read processed/<file> line-by-line.
 *   3. Parse each line as a QueueRecord; skip + log on parse error.
 *   4. Look up handler by surface; skip + log if unregistered.
 *   5. Skip + log if schemaVersion is unsupported (best-effort forward compat).
 *   6. Catch handler errors per-record; log and continue.
 *   7. Delete processed/<file> if every record dispatched successfully.
 *      Otherwise leave it in place for human review (its records have already
 *      been dispatched once — re-running drain only sees NEW queue/<file>s).
 *
 * Idempotence: re-running drain after a clean run is a no-op (nothing in queue/).
 * Re-running after a partial-failure run does not re-import anything — only
 * new queue files are processed.
 */

import fs from 'node:fs';
import path from 'node:path';

import log from '../logger';
import { getQueueDir, type QueueRecord } from './telemetryQueue';

export type SurfaceHandler = (record: QueueRecord) => Promise<void> | void;

export interface DrainSummary {
  filesProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  recordsErrored: number;
}

interface RegisteredHandler {
  handler: SurfaceHandler;
  supportedVersions: Set<number>;
}

const handlers = new Map<string, RegisteredHandler>();

/**
 * Register a drain handler for a surface. Phase C and Wave 53a register
 * concrete handlers; Phase B just provides the slot.
 *
 * Pass `supportedVersions` so the drain can forward-compat skip records that
 * use a schemaVersion the handler doesn't know about. An empty set means
 * "accept all" (rare; use with care).
 */
export function registerSurfaceHandler(
  surface: string,
  handler: SurfaceHandler,
  supportedVersions: Iterable<number> = [],
): void {
  handlers.set(surface, {
    handler,
    supportedVersions: new Set(supportedVersions),
  });
}

/** Test/utility: clear all registered handlers. */
export function clearSurfaceHandlersForTest(): void {
  handlers.clear();
}

function getProcessedDir(): string {
  return path.join(path.dirname(getQueueDir()), 'processed');
}

function ensureDir(dir: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    log.warn('[telemetry-drain] mkdir failed:', err);
    return false;
  }
}

/** Match `<surface>.jsonl` or `<surface>.jsonl.<n>` rotated files. */
function isQueueFilename(name: string): boolean {
  const dot = name.lastIndexOf('.jsonl');
  if (dot < 0) return false;
  const tail = name.slice(dot + '.jsonl'.length);
  if (tail === '') return true;
  if (!tail.startsWith('.')) return false;
  const num = tail.slice(1);
  return num.length > 0 && /^\d+$/.test(num);
}

function listQueueFiles(queueDir: string): string[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path
    return fs.readdirSync(queueDir).filter((n) => isQueueFilename(n));
  } catch {
    return [];
  }
}

function moveAtomic(from: string, to: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path
    fs.renameSync(from, to);
    return true;
  } catch (err) {
    log.warn('[telemetry-drain] atomic move failed:', from, err);
    return false;
  }
}

function readLines(filePath: string): string[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0);
  } catch (err) {
    log.warn('[telemetry-drain] read failed:', filePath, err);
    return [];
  }
}

function parseRecord(line: string): QueueRecord | null {
  try {
    const obj = JSON.parse(line) as Partial<QueueRecord>;
    if (
      typeof obj.recordId !== 'string' ||
      typeof obj.ts !== 'number' ||
      typeof obj.surface !== 'string' ||
      typeof obj.schemaVersion !== 'number'
    ) {
      return null;
    }
    return obj as QueueRecord;
  } catch {
    return null;
  }
}

interface FileResult {
  imported: number;
  skipped: number;
  errored: number;
}

async function dispatchRecord(record: QueueRecord, result: FileResult): Promise<void> {
  const reg = handlers.get(record.surface);
  if (!reg) {
    log.warn('[telemetry-drain] no handler for surface:', record.surface);
    result.skipped += 1;
    return;
  }
  if (reg.supportedVersions.size > 0 && !reg.supportedVersions.has(record.schemaVersion)) {
    log.warn(
      '[telemetry-drain] unsupported schemaVersion',
      record.schemaVersion,
      'for surface',
      record.surface,
    );
    result.skipped += 1;
    return;
  }
  try {
    await reg.handler(record);
    result.imported += 1;
  } catch (err) {
    log.warn('[telemetry-drain] handler threw:', record.surface, err);
    result.errored += 1;
  }
}

async function processFile(processedPath: string): Promise<FileResult> {
  const result: FileResult = { imported: 0, skipped: 0, errored: 0 };
  const lines = readLines(processedPath);
  for (const line of lines) {
    const record = parseRecord(line);
    if (!record) {
      log.warn('[telemetry-drain] malformed record line skipped');
      result.skipped += 1;
      continue;
    }
    await dispatchRecord(record, result);
  }
  return result;
}

function maybeDeleteProcessed(processedPath: string, result: FileResult): void {
  if (result.errored > 0 || result.skipped > 0) {
    log.info('[telemetry-drain] retaining processed file for review:', processedPath);
    return;
  }
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path
    fs.unlinkSync(processedPath);
  } catch (err) {
    log.warn('[telemetry-drain] processed-delete failed:', err);
  }
}

/**
 * Scan the queue, atomically move every file into processed/, dispatch each
 * record to its registered handler, and delete the processed file on a fully
 * successful pass.
 *
 * Returns a summary of work done. Never throws — all errors are logged.
 */
export async function drainQueue(): Promise<DrainSummary> {
  const summary: DrainSummary = {
    filesProcessed: 0,
    recordsImported: 0,
    recordsSkipped: 0,
    recordsErrored: 0,
  };
  const queueDir = getQueueDir();
  const processedDir = getProcessedDir();
  if (!ensureDir(processedDir)) return summary;
  const names = listQueueFiles(queueDir);
  for (const name of names) {
    const from = path.join(queueDir, name);
    const to = path.join(processedDir, name);
    if (!moveAtomic(from, to)) continue;
    const result = await processFile(to);
    summary.filesProcessed += 1;
    summary.recordsImported += result.imported;
    summary.recordsSkipped += result.skipped;
    summary.recordsErrored += result.errored;
    maybeDeleteProcessed(to, result);
  }
  return summary;
}
