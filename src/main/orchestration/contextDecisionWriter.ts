/**
 * contextDecisionWriter.ts — Async-batched JSONL writer for context decisions.
 *
 * Writes one JSON line per ContextDecision to
 * `{userData}/context-decisions-YYYY-MM-DD.jsonl` (UTC date, Wave 29.5 M2).
 * A new file is opened each UTC day; the handle is cached per-day and closed
 * when the date changes.
 *
 * Intraday size-rotation fires at 10 MB as a safety valve, producing files
 * like `context-decisions-2026-04-16.1.jsonl`. 30-day retention is enforced
 * at startup via `purgeOlderThan` (called from main.ts, not here).
 *
 * Adapter pattern: all I/O deps are injected for testability. Production code
 * calls `getDecisionWriter()` which lazily creates a singleton with real fs deps.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import log from '../logger';
import type { ContextDecision } from './contextTypes';
import { buildDatedFilename } from './jsonlRetention';

// ─── Constants ────────────────────────────────────────────────────────────────

const DECISION_BASENAME = 'context-decisions';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB intraday safety valve
const FLUSH_INTERVAL_MS = 50;

// ─── Adapter (deps injection) ─────────────────────────────────────────────────

export interface DecisionWriterDeps {
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

function makeProductionDeps(userDataPath: string): DecisionWriterDeps {
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

// ─── Per-day path resolution ──────────────────────────────────────────────────

function currentDayPath(deps: DecisionWriterDeps): string {
  const dir = deps.getDir();
  return path.join(dir, buildDatedFilename(DECISION_BASENAME, new Date()));
}

// ─── Intraday size-rotation helpers ──────────────────────────────────────────

function rotationPath(base: string, n: number): string {
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  return `${stem}.${n}${ext}`;
}

async function rotateIfNeeded(filePath: string, deps: DecisionWriterDeps): Promise<void> {
  const size = await deps.readSize(filePath);
  if (size <= MAX_BYTES) return;

  // Shift .2→.3, .1→.2, current→.1 (only 2 intraday siblings; 30-day purge handles old days)
  for (let i = 2; i >= 1; i--) {
    const src = rotationPath(filePath, i);
    const dst = rotationPath(filePath, i + 1);
    try { await deps.rotate(src, dst); } catch { /* may not exist */ }
  }
  await deps.rotate(filePath, rotationPath(filePath, 1));
}

// ─── Writer implementation ────────────────────────────────────────────────────

export interface DecisionWriter {
  recordDecision(decision: ContextDecision): void;
  flushPendingWrites(): Promise<void>;
  closeDecisionWriter(): Promise<void>;
}

interface WriterState {
  queue: ContextDecision[];
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  /** Stamp active when the handle was last resolved (YYYY-MM-DD). */
  activeStamp: string;
}

async function flush(state: WriterState, deps: DecisionWriterDeps): Promise<void> {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.queue.length === 0) return;

  const stamp = deps.todayStamp();
  if (stamp !== state.activeStamp) {
    state.activeStamp = stamp;
  }
  const filePath = path.join(deps.getDir(), `${DECISION_BASENAME}-${stamp}.jsonl`);

  const batch = state.queue.splice(0);
  await rotateIfNeeded(filePath, deps);

  const lines = batch.map((d) => JSON.stringify(d)).join('\n') + '\n';
  try {
    await deps.appendLine(filePath, lines);
  } catch (err) {
    log.error('[contextDecisionWriter] appendLine error', err);
  }
}

function scheduleFlush(state: WriterState, deps: DecisionWriterDeps): void {
  if (state.timer !== null || state.closed) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flush(state, deps).catch((err) => {
      log.error('[contextDecisionWriter] flush error', err);
    });
  }, FLUSH_INTERVAL_MS);
}

export function createDecisionWriter(deps: DecisionWriterDeps): DecisionWriter {
  const state: WriterState = {
    queue: [],
    timer: null,
    closed: false,
    activeStamp: deps.todayStamp(),
  };

  return {
    recordDecision(decision) {
      if (state.closed) return;
      state.queue.push({ ...decision, id: decision.id || randomUUID() });
      scheduleFlush(state, deps);
    },

    async flushPendingWrites() {
      await flush(state, deps);
    },

    async closeDecisionWriter() {
      state.closed = true;
      await flush(state, deps);
    },
  };
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let singleton: DecisionWriter | null = null;

export function initDecisionWriter(userDataPath: string): void {
  if (singleton) return;
  singleton = createDecisionWriter(makeProductionDeps(userDataPath));
  log.info('[contextDecisionWriter] initialised');
}

export function getDecisionWriter(): DecisionWriter | null {
  return singleton;
}

export function closeDecisionWriter(): Promise<void> {
  if (!singleton) return Promise.resolve();
  const writer = singleton;
  singleton = null;
  log.info('[contextDecisionWriter] closing');
  return writer.closeDecisionWriter();
}

/** Helper exposed for production startup — returns the userData dir. */
export function getDecisionWriterDir(userDataPath: string): string {
  return userDataPath;
}

/** Returns the current day's file path (used by startup purge logging). */
export function currentDecisionFilePath(userDataPath: string): string {
  return currentDayPath(makeProductionDeps(userDataPath));
}

/** @internal Test-only reset */
export function _resetDecisionWriterForTests(): void {
  singleton = null;
}
