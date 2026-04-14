/**
 * loggerQueue.ts — EMFILE-resilient retry queue for electron-log's file transport.
 *
 * electron-log's async write path drains asyncWriteQueue into a single fs.writeFile
 * call. On EMFILE the entire batch is lost. This module patches the File instance
 * returned by transport.getFile() so that on EMFILE the lost text is re-queued and
 * retried with exponential backoff: 10ms → 100ms → 1000ms (3 attempts, then drop).
 */

import fs from 'fs';

import { describeFdPressure } from './fdPressureDiagnostics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron-log internals
type ElectronLogFileTransport = any;

type FsWriter = (
  path: string,
  data: string,
  opts: Record<string, unknown>,
  cb: (err: NodeJS.ErrnoException | null) => void,
) => void;

const EMFILE_CODES = new Set(['EMFILE', 'ENFILE']);
const RETRY_DELAYS_MS = [10, 100, 1_000] as const;
const MAX_QUEUE_SIZE = 500;

interface RetryEntry {
  text: string;
  attempts: number;
  path: string;
  opts: Record<string, unknown>;
  writer: FsWriter;
}

// Module-level ring buffer — shared across all transport patches in one process.
const retryQueue: RetryEntry[] = [];
let overflowFired = false;

function isEmfileError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    EMFILE_CODES.has((e as NodeJS.ErrnoException).code ?? '')
  );
}

function drainRetryQueue(): void {
  if (retryQueue.length > 0) {
    const next = retryQueue.shift()!;
    scheduleRetry(next);
  } else {
    overflowFired = false;
  }
}

function flushEntry(entry: RetryEntry): void {
  entry.writer(entry.path, entry.text, entry.opts, (err) => {
    if (!err) {
      drainRetryQueue();
      return;
    }
    if (isEmfileError(err)) {
      scheduleRetry(entry);
    } else {
      console.error('[loggerQueue] non-retryable write error:', err);
    }
  });
}

function scheduleRetry(entry: RetryEntry): void {
  const delay = RETRY_DELAYS_MS[entry.attempts as 0 | 1 | 2] ?? null;
  if (delay === null) {
    console.warn(
      `[loggerQueue] dropped log line after ${RETRY_DELAYS_MS.length} retries`,
      { pressure: describeFdPressure() },
    );
    return;
  }
  entry.attempts += 1;
  setTimeout(() => flushEntry(entry), delay);
}

function enqueueForRetry(entry: Omit<RetryEntry, 'attempts'>): void {
  if (retryQueue.length >= MAX_QUEUE_SIZE) {
    if (!overflowFired) {
      overflowFired = true;
      console.error(
        `[loggerQueue] ring buffer full (${MAX_QUEUE_SIZE}); oldest entries dropped`,
        { pressure: describeFdPressure() },
      );
    }
    retryQueue.shift(); // drop oldest to make room
  }
  retryQueue.push({ ...entry, attempts: 0 });
}

/**
 * Patch the electron-log file transport so EMFILE-failed writes are retried.
 * @param transport  electronLog.transports.file
 * @param writer     Injectable fs.writeFile-compatible function (for tests).
 */
export function wrapFileTransport(
  transport: ElectronLogFileTransport,
  writer: FsWriter = fs.writeFile as unknown as FsWriter,
): void {
  const file = transport.getFile() as {
    path: string;
    writeOptions: Record<string, unknown>;
    asyncWriteQueue: string[];
    hasActiveAsyncWriting: boolean;
    nextAsyncWrite: () => void;
  };

  const filePath = file.path;
  const writeOpts = { ...file.writeOptions };
  const originalNext = file.nextAsyncWrite.bind(file);

  file.nextAsyncWrite = function patchedNextAsyncWrite(this: typeof file): void {
    if (this.hasActiveAsyncWriting || this.asyncWriteQueue.length === 0) return;

    const text = this.asyncWriteQueue.join('');
    this.asyncWriteQueue = [];
    this.hasActiveAsyncWriting = true;

    writer(filePath, text, writeOpts, (err) => {
      this.hasActiveAsyncWriting = false;
      if (!err) {
        originalNext();
        return;
      }
      if (isEmfileError(err)) {
        enqueueForRetry({ text, path: filePath, opts: writeOpts, writer });
        scheduleRetry(retryQueue[retryQueue.length - 1]);
        originalNext();
      } else {
        // Non-EMFILE error: put text back so the original handler can surface it.
        this.asyncWriteQueue.unshift(text);
        originalNext();
      }
    });
  };
}

/** Drain the retry queue to completion. Exposed for tests. */
export async function drainQueue(): Promise<void> {
  await new Promise<void>((resolve) => {
    const check = (): void => {
      if (retryQueue.length === 0) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}
