/**
 * contextOutcomeWriter.ts — Async-batched JSONL writer for context outcomes.
 *
 * Writes one JSON line per ContextOutcome to
 * `{userData}/context-outcomes-YYYY-MM-DD.jsonl` (UTC date, Wave 29.5 M2).
 * A new file is opened each UTC day; the handle is cached per-day and closed
 * when the date changes.
 *
 * Intraday size-rotation fires at 10 MB as a safety valve, producing files
 * like `context-outcomes-2026-04-16.1.jsonl`. 30-day retention is enforced
 * at startup via `purgeOlderThan` (called from main.ts, not here).
 *
 * Mirrors the Phase A contextDecisionWriter.ts API exactly, but for ContextOutcome
 * records. Singleton lifecycle: initOutcomeWriter / getOutcomeWriter / closeOutcomeWriter.
 *
 * "ContextOutcomeWriter" name disambiguates from the Wave 15 telemetry
 * outcomeObserver (src/main/telemetry/outcomeObserver.ts), which tracks
 * PTY-exit and conflict outcomes against telemetry store records.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import log from '../logger';
import type { ContextOutcome } from './contextTypes';

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTCOME_BASENAME = 'context-outcomes';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB intraday safety valve
const FLUSH_INTERVAL_MS = 50;

// ─── Adapter (deps injection) ─────────────────────────────────────────────────

export interface OutcomeWriterDeps {
  /** Return the directory where JSONL files are written. */
  getDir: () => string;
  /** Return file size in bytes, or 0 if missing. */
  readSize: (filePath: string) => Promise<number>;
  /** Append a newline-terminated string to the file. */
  appendLine: (filePath: string, line: string) => Promise<void>;
  /** Rename src → dst. */
  rotate: (src: string, dst: string) => Promise<void>;
  /** Delete a file (best-effort). */
  unlink: (filePath: string) => Promise<void>;
  /** Return today's UTC date stamp (YYYY-MM-DD). Injected for testability. */
  todayStamp: () => string;
}

// ─── Production adapter ───────────────────────────────────────────────────────

function makeProductionDeps(userDataPath: string): OutcomeWriterDeps {
  return {
    getDir: () => userDataPath,
    async readSize(fp) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        const stat = await fs.stat(fp);
        return stat.size;
      } catch {
        return 0;
      }
    },
    async appendLine(fp, line) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
      await fs.appendFile(fp, line, 'utf8');
    },
    async rotate(src, dst) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
      await fs.rename(src, dst);
    },
    async unlink(fp) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        await fs.unlink(fp);
      } catch {
        // Best-effort
      }
    },
    todayStamp: () => new Date().toISOString().slice(0, 10),
  };
}

// ─── Intraday size-rotation helpers ──────────────────────────────────────────

function rotationPath(base: string, n: number): string {
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  return `${stem}.${n}${ext}`;
}

async function rotateIfNeeded(filePath: string, deps: OutcomeWriterDeps): Promise<void> {
  const size = await deps.readSize(filePath);
  if (size <= MAX_BYTES) return;

  for (let i = 2; i >= 1; i--) {
    const src = rotationPath(filePath, i);
    const dst = rotationPath(filePath, i + 1);
    try { await deps.rotate(src, dst); } catch { /* may not exist */ }
  }
  await deps.rotate(filePath, rotationPath(filePath, 1));
}

// ─── Outcome record with a generated id ───────────────────────────────────────

/** Wire format: ContextOutcome extended with a generated row id. */
export interface ContextOutcomeRecord extends ContextOutcome {
  id: string;
}

// ─── Writer implementation ────────────────────────────────────────────────────

export interface ContextOutcomeWriter {
  recordOutcome(outcome: ContextOutcome): void;
  flushPendingWrites(): Promise<void>;
  closeOutcomeWriter(): Promise<void>;
}

interface WriterState {
  queue: ContextOutcomeRecord[];
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  /** Stamp active when the handle was last resolved (YYYY-MM-DD). */
  activeStamp: string;
}

async function flush(state: WriterState, deps: OutcomeWriterDeps): Promise<void> {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.queue.length === 0) return;

  const stamp = deps.todayStamp();
  if (stamp !== state.activeStamp) {
    state.activeStamp = stamp;
  }
  const filePath = path.join(deps.getDir(), `${OUTCOME_BASENAME}-${stamp}.jsonl`);

  const batch = state.queue.splice(0);
  await rotateIfNeeded(filePath, deps);

  const lines = batch.map((o) => JSON.stringify(o)).join('\n') + '\n';
  try {
    await deps.appendLine(filePath, lines);
  } catch (err) {
    log.error('[contextOutcomeWriter] appendLine error', err);
  }
}

function scheduleFlush(state: WriterState, deps: OutcomeWriterDeps): void {
  if (state.timer !== null || state.closed) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flush(state, deps).catch((err) => {
      log.error('[contextOutcomeWriter] flush error', err);
    });
  }, FLUSH_INTERVAL_MS);
}

export function createOutcomeWriter(deps: OutcomeWriterDeps): ContextOutcomeWriter {
  const state: WriterState = {
    queue: [],
    timer: null,
    closed: false,
    activeStamp: deps.todayStamp(),
  };

  return {
    recordOutcome(outcome) {
      if (state.closed) return;
      state.queue.push({ ...outcome, id: randomUUID() });
      scheduleFlush(state, deps);
    },

    async flushPendingWrites() {
      await flush(state, deps);
    },

    async closeOutcomeWriter() {
      state.closed = true;
      await flush(state, deps);
    },
  };
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let singleton: ContextOutcomeWriter | null = null;

export function initOutcomeWriter(userDataPath: string): void {
  if (singleton) return;
  singleton = createOutcomeWriter(makeProductionDeps(userDataPath));
  log.info('[contextOutcomeWriter] initialised');
}

export function getOutcomeWriter(): ContextOutcomeWriter | null {
  return singleton;
}

export function closeOutcomeWriter(): Promise<void> {
  if (!singleton) return Promise.resolve();
  const writer = singleton;
  singleton = null;
  log.info('[contextOutcomeWriter] closing');
  return writer.closeOutcomeWriter();
}

/** @internal Test-only reset */
export function _resetOutcomeWriterForTests(): void {
  singleton = null;
}
