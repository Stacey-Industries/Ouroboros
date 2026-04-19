/**
 * traceBatcher.ts — In-memory micro-batch queue for orchestration_traces inserts.
 *
 * Enqueueing is synchronous (O(1)). Flushing is async, running every FLUSH_INTERVAL_MS
 * or when the soft cap (SOFT_CAP) is reached. On repeated overflow (>5 consecutive
 * full-flush cycles within 2 s), stdout traces are sampled at 1-in-10 to protect
 * PTY throughput. Stdin and spawn traces are never sampled.
 *
 * Drain on shutdown: call `drainTraceBatcher()` before closing the DB.
 */

import crypto from 'node:crypto';

import log from '../logger';
import { getTelemetryStore } from './telemetryStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 500;
const SOFT_CAP = 200;
const OVERFLOW_WINDOW_MS = 2_000;
const OVERFLOW_THRESHOLD = 5;
const STDOUT_SAMPLE_RATE = 10; // 1-in-10

// ─── Types ────────────────────────────────────────────────────────────────────

export type TraceKind = 'spawn' | 'stdin' | 'stdout';

export interface TraceEntry {
  traceId: string;
  sessionId: string;
  kind: TraceKind;
  payload: Record<string, unknown>;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let queue: TraceEntry[] = [];
let flushHandle: ReturnType<typeof setInterval> | null = null;

// Overflow tracking
let overflowCount = 0;
let overflowWindowStart = 0;
let samplingActive = false;
let stdoutCounter = 0;

// ─── Redaction helpers ────────────────────────────────────────────────────────

const SENSITIVE_FLAGS = new Set(['--api-key', '--token', '--password', '--secret']);
// Literal regex satisfies security/detect-non-literal-regexp rule.
const SK_PATTERN = /sk-[a-zA-Z0-9_-]{8,}/g;

export function redactArgv(argv: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < argv.length) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded loop counter, not user input
    const arg = argv[i];
    if (SENSITIVE_FLAGS.has(arg)) {
      out.push(arg);
      if (i + 1 < argv.length) {
        out.push('***');
        i += 2;
      } else {
        i += 1;
      }
    } else {
      out.push(arg.replace(SK_PATTERN, '***'));
      i += 1;
    }
  }
  return out;
}

export function redactHead(head: string): string {
  return head.replace(SK_PATTERN, '***');
}

// ─── Overflow / sampling ──────────────────────────────────────────────────────

function recordFullFlush(): void {
  const now = Date.now();
  if (now - overflowWindowStart > OVERFLOW_WINDOW_MS) {
    overflowCount = 0;
    overflowWindowStart = now;
  }
  overflowCount += 1;
  if (!samplingActive && overflowCount > OVERFLOW_THRESHOLD) {
    samplingActive = true;
    log.warn('[traceBatcher] high trace volume — stdout sampling engaged (1-in-10)');
  }
}

function shouldEnqueueStdout(): boolean {
  if (!samplingActive) return true;
  stdoutCounter += 1;
  return stdoutCounter % STDOUT_SAMPLE_RATE === 0;
}

// ─── Flush ────────────────────────────────────────────────────────────────────

function flushQueue(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const store = getTelemetryStore();
  if (!store) return;
  for (const entry of batch) {
    store.recordTrace({
      id: crypto.randomUUID(),
      traceId: entry.traceId,
      sessionId: entry.sessionId,
      phase: entry.kind,
      payload: entry.payload,
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function enqueueTrace(entry: TraceEntry): void {
  if (entry.kind === 'stdout' && !shouldEnqueueStdout()) return;

  queue.push(entry);

  if (queue.length >= SOFT_CAP) {
    recordFullFlush();
    flushQueue();
  }
}

export function initTraceBatcher(): void {
  if (flushHandle !== null) return;
  flushHandle = setInterval(() => {
    try {
      flushQueue();
    } catch (err) {
      log.warn('[traceBatcher] flush error', err);
    }
  }, FLUSH_INTERVAL_MS);
  if (typeof flushHandle === 'object' && flushHandle !== null && 'unref' in flushHandle) {
    (flushHandle as NodeJS.Timeout).unref();
  }
}

export function drainTraceBatcher(): void {
  if (flushHandle !== null) {
    clearInterval(flushHandle);
    flushHandle = null;
  }
  try {
    flushQueue();
  } catch (err) {
    log.warn('[traceBatcher] drain error', err);
  }
}

/** @internal Test-only reset — clears all batcher state. */
export function _resetTraceBatcherForTests(): void {
  if (flushHandle !== null) {
    clearInterval(flushHandle);
    flushHandle = null;
  }
  queue = [];
  overflowCount = 0;
  overflowWindowStart = 0;
  samplingActive = false;
  stdoutCounter = 0;
}

/** @internal Test-only queue inspector. */
export function _getQueueForTests(): TraceEntry[] {
  return queue;
}

/** @internal Test-only sampling state inspector. */
export function _isSamplingActiveForTests(): boolean {
  return samplingActive;
}
