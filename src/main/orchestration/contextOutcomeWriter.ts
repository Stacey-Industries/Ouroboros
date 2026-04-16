/**
 * contextOutcomeWriter.ts — Async-batched JSONL writer for context outcomes.
 *
 * Writes one JSON line per ContextOutcome to `{userData}/context-outcomes.jsonl`.
 * Rotates at 10 MB, keeping the last 3 rotations (context-outcomes.1.jsonl,
 * context-outcomes.2.jsonl) and purging older ones.
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

const OUTCOME_FILENAME = 'context-outcomes.jsonl';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROTATIONS = 3;
const FLUSH_INTERVAL_MS = 50;

// ─── Adapter (deps injection) ─────────────────────────────────────────────────

export interface OutcomeWriterDeps {
  /** Resolve `{userData}/context-outcomes.jsonl`. */
  getPath: () => string;
  /** Return file size in bytes, or 0 if missing. */
  readSize: (filePath: string) => Promise<number>;
  /** Append a newline-terminated string to the file. */
  appendLine: (filePath: string, line: string) => Promise<void>;
  /** Rename src → dst. */
  rotate: (src: string, dst: string) => Promise<void>;
  /** Delete a file (best-effort). */
  unlink: (filePath: string) => Promise<void>;
  /** List files in a directory, returning names. */
  listDir: (dir: string) => Promise<string[]>;
}

// ─── Production adapter ───────────────────────────────────────────────────────

function makeProductionDeps(userDataPath: string): OutcomeWriterDeps {
  const filePath = path.join(userDataPath, OUTCOME_FILENAME);
  return {
    getPath: () => filePath,
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
    async listDir(dir) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        return await fs.readdir(dir);
      } catch {
        return [];
      }
    },
  };
}

// ─── Rotation helpers ─────────────────────────────────────────────────────────

function rotationPath(base: string, n: number): string {
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  return path.join(path.dirname(base), `${stem}.${n}${ext}`);
}

async function rotateIfNeeded(deps: OutcomeWriterDeps): Promise<void> {
  const filePath = deps.getPath();
  const size = await deps.readSize(filePath);
  if (size <= MAX_BYTES) return;

  // Keep .1 .2 .3 — purge .3, shift .2→.3, .1→.2, current→.1
  await deps.unlink(rotationPath(filePath, MAX_ROTATIONS));

  for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
    const src = rotationPath(filePath, i);
    const dst = rotationPath(filePath, i + 1);
    try {
      await deps.rotate(src, dst);
    } catch {
      // May not exist — skip
    }
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
}

async function flush(state: WriterState, deps: OutcomeWriterDeps): Promise<void> {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.queue.length === 0) return;

  const batch = state.queue.splice(0);
  await rotateIfNeeded(deps);

  const lines = batch.map((o) => JSON.stringify(o)).join('\n') + '\n';
  try {
    await deps.appendLine(deps.getPath(), lines);
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
  const state: WriterState = { queue: [], timer: null, closed: false };

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
